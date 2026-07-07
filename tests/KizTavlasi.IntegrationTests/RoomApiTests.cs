using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using KizTavlasi.IntegrationTests.TestInfrastructure;

namespace KizTavlasi.IntegrationTests;

[Collection("Api")]
public class RoomApiTests
{
    private readonly ApiTestFixture _fixture;

    public RoomApiTests(ApiTestFixture fixture)
    {
        _fixture = fixture;
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private async Task<JsonElement> CreateRoomAsync(HttpClient client, string name = "Ayşe", int bestOf = 1)
    {
        var response = await client.PostAsJsonAsync("/api/rooms", new { displayName = name, bestOf });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
    }

    [Fact]
    public async Task Oda_olusturma_200_ve_token_dondurur()
    {
        using var client = _fixture.CreateClient();

        var body = await CreateRoomAsync(client, "Ayşe", 3);

        body.GetProperty("roomCode").GetString().Should().HaveLength(6);
        body.GetProperty("playerToken").GetString().Should().NotBeNullOrWhiteSpace();
        body.GetProperty("sharePath").GetString().Should().StartWith("/oda/");
        body.GetProperty("roomState").GetProperty("bestOf").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Gecersiz_display_name_problem_details_dondurur()
    {
        using var client = _fixture.CreateClient();

        var response = await client.PostAsJsonAsync("/api/rooms", new { displayName = "A", bestOf = 1 });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        problem.GetProperty("errorCode").GetString().Should().Be("INVALID_COMMAND");
        problem.GetProperty("title").GetString().Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Gecersiz_best_of_reddedilir()
    {
        using var client = _fixture.CreateClient();

        var response = await client.PostAsJsonAsync("/api/rooms", new { displayName = "Ayşe", bestOf = 4 });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Ikinci_oyuncu_katilir_ucuncu_reddedilir()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateRoomAsync(client);
        var roomCode = created.GetProperty("roomCode").GetString();

        var join1 = await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Fatma" });
        join1.StatusCode.Should().Be(HttpStatusCode.OK);

        var join2 = await client.PostAsJsonAsync($"/api/rooms/{roomCode}/join", new { displayName = "Zeynep" });
        join2.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var problem = await join2.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        problem.GetProperty("errorCode").GetString().Should().Be("ROOM_FULL");
    }

    [Fact]
    public async Task Olmayan_oda_404_dondurur()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync("/api/rooms/ZZZZZZ");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        problem.GetProperty("errorCode").GetString().Should().Be("ROOM_NOT_FOUND");
    }

    [Fact]
    public async Task State_endpoint_token_olmadan_401_dondurur()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateRoomAsync(client);
        var roomCode = created.GetProperty("roomCode").GetString();

        var response = await client.GetAsync($"/api/rooms/{roomCode}/state");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task State_endpoint_token_ile_snapshot_dondurur()
    {
        using var client = _fixture.CreateClient();
        var created = await CreateRoomAsync(client);
        var roomCode = created.GetProperty("roomCode").GetString();
        var token = created.GetProperty("playerToken").GetString();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var response = await client.GetAsync($"/api/rooms/{roomCode}/state");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var state = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        state.GetProperty("roomCode").GetString().Should().Be(roomCode);
        state.GetProperty("stateVersion").GetInt64().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Baska_odanin_tokeni_ile_erisim_reddedilir()
    {
        using var client = _fixture.CreateClient();
        var room1 = await CreateRoomAsync(client);
        var room2 = await CreateRoomAsync(client, "Zeynep");

        var room2Code = room2.GetProperty("roomCode").GetString();
        var room1Token = room1.GetProperty("playerToken").GetString();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", room1Token);
        var response = await client.GetAsync($"/api/rooms/{room2Code}/state");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Public_config_urun_adini_dondurur()
    {
        using var client = _fixture.CreateClient();

        var response = await client.GetAsync("/api/config/public");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var config = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        config.GetProperty("productName").GetString().Should().NotBeNullOrWhiteSpace();
        config.GetProperty("supportedBestOf").EnumerateArray().Select(e => e.GetInt32()).Should().Equal(1, 3, 5);
    }

    [Fact]
    public async Task Health_endpoints_calisir()
    {
        using var client = _fixture.CreateClient();

        var live = await client.GetAsync("/health/live");
        var ready = await client.GetAsync("/health/ready");

        live.StatusCode.Should().Be(HttpStatusCode.OK);
        ready.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

[CollectionDefinition("Api")]
public class ApiCollection : ICollectionFixture<ApiTestFixture>;
