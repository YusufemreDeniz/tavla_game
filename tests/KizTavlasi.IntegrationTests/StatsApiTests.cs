using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using KizTavlasi.IntegrationTests.TestInfrastructure;

namespace KizTavlasi.IntegrationTests;

/// <summary>GET /api/rooms/{code}/stats yetkilendirmesi ve yanıt biçimi.</summary>
[Collection("Api")]
public class StatsApiTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ApiTestFixture _fixture;

    public StatsApiTests(ApiTestFixture fixture)
    {
        _fixture = fixture;
    }

    private static async Task<(string RoomCode, string HostToken)> CreateFullRoomAsync(HttpClient client)
    {
        var create = await client.PostAsJsonAsync("/api/rooms", new { displayName = "Ayşe", bestOf = 1 });
        var created = await create.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var roomCode = created.GetProperty("roomCode").GetString()!;
        await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Fatma" });
        return (roomCode, created.GetProperty("playerToken").GetString()!);
    }

    private HttpClient ClientWith(string? token)
    {
        var client = _fixture.CreateClient();
        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    [Fact]
    public async Task Istatistikleri_oyuncu_ve_izleyici_okur_yetkisiz_istek_reddedilir()
    {
        using var anonymous = _fixture.CreateClient();
        var (roomCode, hostToken) = await CreateFullRoomAsync(anonymous);
        using var host = ClientWith(hostToken);

        (await anonymous.GetAsync($"/api/rooms/{roomCode}/stats")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await host.GetAsync($"/api/rooms/{roomCode}/stats")).StatusCode.Should().Be(HttpStatusCode.BadRequest, "henüz maç yok");

        _fixture.Dice.Enqueue(6, 2);
        (await host.PostAsJsonAsync($"/api/rooms/{roomCode}/start", new { commandId = Guid.NewGuid() }))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var response = await host.GetAsync($"/api/rooms/{roomCode}/stats");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var stats = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        stats.GetProperty("roundsPlayed").GetInt32().Should().Be(1);
        stats.GetProperty("players").GetArrayLength().Should().Be(2);

        var watch = await anonymous.PostAsync($"/api/rooms/{roomCode}/watch", null);
        var spectatorToken = (await watch.Content.ReadFromJsonAsync<JsonElement>(JsonOptions)).GetProperty("spectatorToken").GetString();
        using var spectator = ClientWith(spectatorToken);
        (await spectator.GetAsync($"/api/rooms/{roomCode}/stats")).StatusCode.Should().Be(HttpStatusCode.OK);

        // Başka bir odanın token'ı bu odanın istatistiklerini okuyamaz.
        var (_, otherToken) = await CreateFullRoomAsync(anonymous);
        using var other = ClientWith(otherToken);
        (await other.GetAsync($"/api/rooms/{roomCode}/stats")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
