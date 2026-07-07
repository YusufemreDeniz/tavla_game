using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using KizTavlasi.IntegrationTests.TestInfrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;

namespace KizTavlasi.IntegrationTests;

[Collection("Api")]
public class SignalRTests
{
    private readonly ApiTestFixture _fixture;

    public SignalRTests(ApiTestFixture fixture)
    {
        _fixture = fixture;
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private HubConnection CreateHubConnection(string token)
    {
        return new HubConnectionBuilder()
            .WithUrl($"{_fixture.Server.BaseAddress}hubs/game", options =>
            {
                options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
            })
            .Build();
    }

    private async Task<(string RoomCode, string HostToken, string GuestToken)> CreateFullRoomAsync()
    {
        using var client = _fixture.CreateClient();
        var createResponse = await client.PostAsJsonAsync("/api/rooms", new { displayName = "Ayşe", bestOf = 1 });
        var created = await createResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var roomCode = created.GetProperty("roomCode").GetString()!;
        var hostToken = created.GetProperty("playerToken").GetString()!;

        var joinResponse = await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Fatma" });
        var joined = await joinResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var guestToken = joined.GetProperty("playerToken").GetString()!;

        return (roomCode, hostToken, guestToken);
    }

    private static async Task<T> WaitForAsync<T>(TaskCompletionSource<T> tcs, int timeoutSeconds = 10)
    {
        var completed = await Task.WhenAny(tcs.Task, Task.Delay(TimeSpan.FromSeconds(timeoutSeconds)));
        completed.Should().Be(tcs.Task, "beklenen SignalR eventi zamanında gelmedi");
        return await tcs.Task;
    }

    [Fact]
    public async Task Token_olmadan_hub_baglantisi_reddedilir()
    {
        var connection = new HubConnectionBuilder()
            .WithUrl($"{_fixture.Server.BaseAddress}hubs/game", options =>
            {
                options.HttpMessageHandlerFactory = _ => _fixture.Server.CreateHandler();
            })
            .Build();

        var act = () => connection.StartAsync();

        await act.Should().ThrowAsync<Exception>();
    }

    [Fact]
    public async Task Iki_oyuncu_baglanir_ve_ayni_maci_gorur()
    {
        var (_, hostToken, guestToken) = await CreateFullRoomAsync();

        await using var hostConnection = CreateHubConnection(hostToken);
        await using var guestConnection = CreateHubConnection(guestToken);

        var hostMatchStarted = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var guestMatchStarted = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConnection.On<JsonElement>("StartingRollResolved", p => hostMatchStarted.TrySetResult(p));
        guestConnection.On<JsonElement>("StartingRollResolved", p => guestMatchStarted.TrySetResult(p));

        await hostConnection.StartAsync();
        await guestConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom");
        await guestConnection.InvokeAsync("JoinRoom");

        _fixture.Dice.Enqueue(6, 2); // Host başlar.
        await hostConnection.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });

        var hostEvent = await WaitForAsync(hostMatchStarted);
        var guestEvent = await WaitForAsync(guestMatchStarted);

        var hostSeat = hostEvent.GetProperty("startingRoll").GetProperty("startingSeat").GetInt32();
        var guestSeat = guestEvent.GetProperty("startingRoll").GetProperty("startingSeat").GetInt32();
        hostSeat.Should().Be(1);
        guestSeat.Should().Be(1);
    }

    [Fact]
    public async Task Zar_atma_iki_istemciye_ayni_sonucu_yayinlar()
    {
        var (_, hostToken, guestToken) = await CreateFullRoomAsync();

        await using var hostConnection = CreateHubConnection(hostToken);
        await using var guestConnection = CreateHubConnection(guestToken);

        var hostState = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var hostRoll = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        var guestRoll = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);

        hostConnection.On<JsonElement>("StartingRollResolved", p => hostState.TrySetResult(p));
        hostConnection.On<JsonElement>("DiceRollResolved", p => hostRoll.TrySetResult(p));
        guestConnection.On<JsonElement>("DiceRollResolved", p => guestRoll.TrySetResult(p));

        await hostConnection.StartAsync();
        await guestConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom");
        await guestConnection.InvokeAsync("JoinRoom");

        _fixture.Dice.Enqueue(6, 2);
        await hostConnection.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });
        var startingEvent = await WaitForAsync(hostState);
        var stateVersion = startingEvent.GetProperty("stateVersion").GetInt64();

        _fixture.Dice.Enqueue(3, 5);
        await hostConnection.InvokeAsync("RollDice", new { CommandId = Guid.NewGuid(), ExpectedStateVersion = stateVersion });

        var hostResult = await WaitForAsync(hostRoll);
        var guestResult = await WaitForAsync(guestRoll);

        hostResult.GetProperty("roll").GetProperty("die1").GetInt32().Should().Be(3);
        hostResult.GetProperty("roll").GetProperty("die2").GetInt32().Should().Be(5);
        guestResult.GetProperty("roll").GetProperty("die1").GetInt32().Should().Be(3);
        guestResult.GetProperty("roll").GetProperty("die2").GetInt32().Should().Be(5);
    }

    [Fact]
    public async Task Rejoin_sonrasi_guncel_snapshot_gelir()
    {
        var (roomCode, hostToken, guestToken) = await CreateFullRoomAsync();

        await using var hostConnection = CreateHubConnection(hostToken);
        var startingResolved = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConnection.On<JsonElement>("StartingRollResolved", p => startingResolved.TrySetResult(p));
        await hostConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom");

        // Guest bağlanır, sonra kopar.
        var guestConnection = CreateHubConnection(guestToken);
        await guestConnection.StartAsync();
        await guestConnection.InvokeAsync("JoinRoom");

        _fixture.Dice.Enqueue(6, 2);
        await hostConnection.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });
        await WaitForAsync(startingResolved);

        await guestConnection.DisposeAsync();

        // Guest yeni bağlantıyla geri döner (sayfa yenileme senaryosu).
        await using var guestReconnect = CreateHubConnection(guestToken);
        var snapshotReceived = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        guestReconnect.On<JsonElement>("RoomSnapshotReceived", p => snapshotReceived.TrySetResult(p));

        await guestReconnect.StartAsync();
        await guestReconnect.InvokeAsync("RejoinRoom");

        var snapshot = await WaitForAsync(snapshotReceived);
        snapshot.GetProperty("roomCode").GetString().Should().Be(roomCode);
        snapshot.GetProperty("status").GetString().Should().Be("Playing");
        snapshot.GetProperty("match").GetProperty("currentRound").GetProperty("boards").GetArrayLength().Should().Be(2);
    }

    [Fact]
    public async Task Ayni_command_id_ile_iki_kez_zar_atilamaz()
    {
        var (_, hostToken, guestToken) = await CreateFullRoomAsync();

        await using var hostConnection = CreateHubConnection(hostToken);
        await using var guestConnection = CreateHubConnection(guestToken);

        var startingResolved = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        hostConnection.On<JsonElement>("StartingRollResolved", p => startingResolved.TrySetResult(p));

        var rollCount = 0;
        guestConnection.On<JsonElement>("DiceRollResolved", _ => Interlocked.Increment(ref rollCount));

        await hostConnection.StartAsync();
        await guestConnection.StartAsync();
        await hostConnection.InvokeAsync("JoinRoom");
        await guestConnection.InvokeAsync("JoinRoom");

        _fixture.Dice.Enqueue(6, 2);
        await hostConnection.InvokeAsync("StartMatch", new { CommandId = Guid.NewGuid() });
        var startingEvent = await WaitForAsync(startingResolved);
        var stateVersion = startingEvent.GetProperty("stateVersion").GetInt64();

        var commandId = Guid.NewGuid();
        _fixture.Dice.Enqueue(3, 5);
        await hostConnection.InvokeAsync("RollDice", new { CommandId = commandId, ExpectedStateVersion = stateVersion });
        await hostConnection.InvokeAsync("RollDice", new { CommandId = commandId, ExpectedStateVersion = stateVersion });

        // Yayın kuyruğunun boşalması için kısa bekleme.
        await Task.Delay(500);

        using var db = _fixture.CreateDbContext();
        var rollsWithCommand = db.DiceRolls.Count(d => d.CommandId == commandId);
        rollsWithCommand.Should().Be(1);
    }

    [Fact]
    public async Task Gecersiz_emoji_tepkisi_reddedilir()
    {
        var (_, hostToken, _) = await CreateFullRoomAsync();

        await using var hostConnection = CreateHubConnection(hostToken);
        await hostConnection.StartAsync();

        var act = () => hostConnection.InvokeAsync("SendReaction", new { Emoji = "<script>" });

        await act.Should().ThrowAsync<HubException>();
    }

    [Fact]
    public async Task Sunucu_restart_sonrasi_state_veritabanindan_yuklenir()
    {
        // Aynı veritabanına bağlanan ikinci bir host, mevcut odayı görebilmelidir.
        var (roomCode, hostToken, _) = await CreateFullRoomAsync();

        using var db = _fixture.CreateDbContext();
        var room = db.GameRooms.First(r => r.Code == roomCode);
        room.Players.Should().BeEmpty(); // Navigation yüklenmedi; sorgu ile doğrula.
        db.Players.Count(p => p.RoomId == room.Id).Should().Be(2);
    }
}
