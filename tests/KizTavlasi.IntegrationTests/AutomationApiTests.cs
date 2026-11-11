using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using KizTavlasi.IntegrationTests.TestInfrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace KizTavlasi.IntegrationTests;

/// <summary>Gerçek host üzerinde bot odası, arka plan otomasyonu ve izleyici modu.</summary>
[Collection("Api")]
public class AutomationApiTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFixture _fixture;

    public AutomationApiTests(ApiTestFixture fixture)
    {
        _fixture = fixture;
    }

    private HubConnection CreateHubConnection(string token) =>
        new HubConnectionBuilder()
            .WithUrl($"{_fixture.Server.BaseAddress}hubs/game", options =>
            {
                options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();

    private static async Task<T> WaitForAsync<T>(TaskCompletionSource<T> tcs, int timeoutSeconds = 10)
    {
        var completed = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(timeoutSeconds)));
        completed.Should().Be(tcs.Task, "beklenen SignalR eventi zamanında gelmedi");
        return await tcs.Task;
    }

    [Fact]
    public async Task Bot_odasi_olusturulur_ve_gecersiz_zorluk_reddedilir()
    {
        using var client = _fixture.CreateClient();

        var ok = await client.PostAsJsonAsync("/api/rooms/bot", new { displayName = "Ayşe", bestOf = 3, difficulty = "Master", turnTimeLimitSeconds = 30 });
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await ok.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var state = body.GetProperty("roomState");
        state.GetProperty("turnTimeLimitSeconds").GetInt32().Should().Be(30);
        state.GetProperty("players").EnumerateArray().Should().Contain(p => p.GetProperty("isBot").GetBoolean());

        var bad = await client.PostAsJsonAsync("/api/rooms/bot", new { displayName = "Ayşe", bestOf = 1, difficulty = "Hard" });
        bad.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Bot_sirasi_geldiginde_arka_plan_servisi_zar_atar_ve_hamle_yayinlar()
    {
        using var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/rooms/bot", new { displayName = "Ayşe", bestOf = 1, difficulty = "Easy" });
        var created = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var token = created.GetProperty("playerToken").GetString()!;
        var botId = created.GetProperty("roomState").GetProperty("players").EnumerateArray()
            .First(p => p.GetProperty("isBot").GetBoolean()).GetProperty("id").GetGuid();

        await using var connection = CreateHubConnection(token);
        var botRolled = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var botMoved = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        connection.On<JsonElement>("DiceRollResolved", p =>
        {
            if (p.GetProperty("roll").GetProperty("playerId").GetGuid() == botId)
            {
                botRolled.TrySetResult(p);
            }
        });
        connection.On<JsonElement>("MovePlayed", p =>
        {
            if (p.GetProperty("movePlayed").GetProperty("playerId").GetGuid() == botId)
            {
                botMoved.TrySetResult(p);
            }
        });

        await connection.StartAsync();
        await connection.InvokeAsync("JoinRoom");

        // Bot başlar; 6-3 başlangıçta oynanabilir, dolayısıyla bot hamle de yapar.
        _fixture.Dice.Enqueue(1, 6, 6, 3);
        await connection.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });

        var roll = await WaitForAsync(botRolled);
        roll.GetProperty("roll").GetProperty("die1").GetInt32().Should().Be(6);
        var move = await WaitForAsync(botMoved);
        move.GetProperty("movePlayed").GetProperty("pointNumber").GetInt32().Should().BeOneOf(6, 3);
    }

    [Fact]
    public async Task Izleyici_dolu_odayi_izler_ama_komut_gonderemez()
    {
        using var client = _fixture.CreateClient();
        var create = await client.PostAsJsonAsync("/api/rooms", new { displayName = "Ayşe", bestOf = 1 });
        var created = await create.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var roomCode = created.GetProperty("roomCode").GetString()!;
        var hostToken = created.GetProperty("playerToken").GetString()!;
        await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Fatma" });

        var third = await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Zeynep" });
        third.StatusCode.Should().Be(HttpStatusCode.Conflict, "oyuncu koltukları dolu");

        var watch = await client.PostAsync($"/api/rooms/{roomCode}/watch", null);
        watch.StatusCode.Should().Be(HttpStatusCode.OK);
        var watchBody = await watch.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var spectatorToken = watchBody.GetProperty("spectatorToken").GetString()!;

        // İzleyici token'ı REST oyuncu uçlarında da işe yaramaz.
        using var spectatorClient = _fixture.CreateClient();
        spectatorClient.DefaultRequestHeaders.Authorization = new("Bearer", spectatorToken);
        var stateAsSpectator = await spectatorClient.GetAsync($"/api/rooms/{roomCode}/state");
        stateAsSpectator.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        await using var spectator = CreateHubConnection(spectatorToken);
        await using var host = CreateHubConnection(hostToken);
        var snapshot = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var spectatorSawStart = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var hostSawSpectators = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        spectator.On<JsonElement>("RoomSnapshotReceived", p => snapshot.TrySetResult(p));
        spectator.On<JsonElement>("StartingRollResolved", p => spectatorSawStart.TrySetResult(p));
        host.On<JsonElement>("SpectatorCountChanged", p =>
        {
            if (p.GetProperty("count").GetInt32() > 0)
            {
                hostSawSpectators.TrySetResult(p.GetProperty("count").GetInt32());
            }
        });

        await host.StartAsync();
        await host.InvokeAsync("JoinRoom");
        await spectator.StartAsync();
        await spectator.InvokeAsync("JoinRoom");

        (await WaitForAsync(snapshot)).GetProperty("players").GetArrayLength().Should().Be(2);
        (await WaitForAsync(hostSawSpectators)).Should().Be(1);

        var roll = () => spectator.InvokeAsync("RollDice", new { CommandId = Guid.NewGuid(), ExpectedStateVersion = 2L });
        await roll.Should().ThrowAsync<HubException>();
        var reaction = () => spectator.InvokeAsync("SendReaction", new { Emoji = "🔥" });
        await reaction.Should().ThrowAsync<HubException>();
        var start = () => spectator.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });
        await start.Should().ThrowAsync<HubException>();

        _fixture.Dice.Enqueue(6, 2);
        await host.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });
        (await WaitForAsync(spectatorSawStart)).GetProperty("startingRoll").GetProperty("startingSeat").GetInt32().Should().Be(1);
    }
}
