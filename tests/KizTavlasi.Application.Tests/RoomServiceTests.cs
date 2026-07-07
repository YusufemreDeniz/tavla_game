using FluentAssertions;
using KizTavlasi.Application.Dtos;
using KizTavlasi.Application.Tests.TestInfrastructure;
using KizTavlasi.Domain;

namespace KizTavlasi.Application.Tests;

[Collection("Database")]
public class RoomServiceTests : IDisposable
{
    private readonly TestHarness _harness;

    public RoomServiceTests(SqlTestDatabase database)
    {
        _harness = new TestHarness(database);
    }

    public void Dispose() => _harness.Dispose();

    [Fact]
    public async Task Oda_olusturma_kod_token_ve_snapshot_dondurur()
    {
        var result = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 3));

        result.RoomCode.Should().HaveLength(6);
        result.RoomCode.Should().NotContainAny("0", "O", "1", "I", "L");
        result.SharePath.Should().Be($"/oda/{result.RoomCode}");
        result.PlayerToken.Should().NotBeNullOrWhiteSpace();
        result.Player.Seat.Should().Be(1);
        result.Player.IsHost.Should().BeTrue();
        result.RoomState.Status.Should().Be("Waiting");
        result.RoomState.BestOf.Should().Be(3);
        result.RoomState.StateVersion.Should().Be(1);
    }

    [Fact]
    public async Task Ikinci_oyuncu_odaya_katilabilir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));

        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));

        joined.Player.Seat.Should().Be(2);
        joined.Player.IsHost.Should().BeFalse();
        joined.RoomState.Players.Should().HaveCount(2);
        joined.RoomState.Status.Should().Be("InLobby");
        _harness.Notifier.Events.Should().Contain("PlayerJoined");
    }

    [Fact]
    public async Task Oda_kodu_kucuk_harfle_de_bulunur()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));

        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode.ToLowerInvariant(), new JoinRoomRequest("Fatma"));

        joined.RoomCode.Should().Be(created.RoomCode);
    }

    [Fact]
    public async Task Ucuncu_oyuncu_reddedilir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));

        var act = () => _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Zeynep"));

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.RoomFull);
    }

    [Fact]
    public async Task Olmayan_oda_bulunamadi_hatasi_verir()
    {
        var act = () => _harness.RoomService.JoinRoomAsync("XXXXXX", new JoinRoomRequest("Fatma"));

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.RoomNotFound);
    }

    [Fact]
    public async Task Suresi_gecmis_odaya_katilim_reddedilir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));

        _harness.Time.Advance(TimeSpan.FromHours(25));

        var act = () => _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.RoomExpired);
    }

    [Fact]
    public async Task Gecerli_oturum_dogrulanir_ve_state_dondurulur()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 5));
        var session = _harness.SessionFor(created.PlayerToken);

        await _harness.RoomService.ValidateSessionAsync(session);
        var state = await _harness.RoomService.GetRoomStateAsync(session);

        state.RoomCode.Should().Be(created.RoomCode);
        state.BestOf.Should().Be(5);
    }

    [Fact]
    public async Task Sahte_jti_ile_oturum_reddedilir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var session = _harness.SessionFor(created.PlayerToken) with { Jti = "sahte-jti" };

        var act = () => _harness.RoomService.ValidateSessionAsync(session);

        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.InvalidSession);
    }

    [Fact]
    public async Task Display_name_sanitize_edilir()
    {
        var result = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("  Ayşe \t  Hanım \n ", 1));

        result.Player.DisplayName.Should().Be("Ayşe Hanım");
    }
}

[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<SqlTestDatabase>;
