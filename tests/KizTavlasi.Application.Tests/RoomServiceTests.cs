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
        _harness.Notifier.AnyNotificationInsideTransaction.Should().BeFalse("bildirimler transaction commit sonrasinda calismali");
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

    [Fact]
    public async Task Coklu_sekme_baglantisinda_bir_sekme_kapaninca_oyuncu_cevrimdisi_olmaz()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var session = _harness.SessionFor(created.PlayerToken);

        await _harness.RoomService.SetConnectionStateAsync(session, isConnected: true, connectionId: "conn-tab-1");
        await _harness.RoomService.SetConnectionStateAsync(session, isConnected: true, connectionId: "conn-tab-2");

        // İlk sekme kapandığında ikinci sekme hâlâ açık olduğu için oyuncu çevrim içi kalmalı.
        await _harness.RoomService.SetConnectionStateAsync(session, isConnected: false, connectionId: "conn-tab-1");
        var stateAfterFirstClose = await _harness.RoomService.GetRoomStateAsync(session);
        stateAfterFirstClose.Players.Single().IsConnected.Should().BeTrue();

        // Son sekme de kapandığında oyuncu çevrim dışı olmalı.
        await _harness.RoomService.SetConnectionStateAsync(session, isConnected: false, connectionId: "conn-tab-2");
        var stateAfterSecondClose = await _harness.RoomService.GetRoomStateAsync(session);
        stateAfterSecondClose.Players.Single().IsConnected.Should().BeFalse();
    }

    [Fact]
    public async Task Aktif_macta_oyuncu_odadan_ayrilirsa_kalan_oyuncu_hukmen_kazanir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 3));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        var hostSession = _harness.SessionFor(created.PlayerToken);
        var guestSession = _harness.SessionFor(joined.PlayerToken);

        _harness.Dice.Enqueue(6, 2);
        await _harness.GameService.StartMatchAsync(hostSession, Guid.NewGuid());

        await _harness.RoomService.LeaveRoomAsync(guestSession);

        var state = await _harness.RoomService.GetRoomStateAsync(hostSession);
        state.Status.Should().Be("Completed");
        state.Match!.Status.Should().Be("Completed");
        state.Match.WinnerPlayerId.Should().Be(hostSession.PlayerId);
        _harness.Notifier.Events.Should().Contain("PlayerLeft").And.Contain("MatchEnded");
    }

    [Fact]
    public async Task Aktif_macta_iki_oyuncu_da_grace_suresini_asarsa_oda_abandoned_olur()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        var hostSession = _harness.SessionFor(created.PlayerToken);
        var guestSession = _harness.SessionFor(joined.PlayerToken);

        await _harness.RoomService.SetConnectionStateAsync(hostSession, isConnected: false);
        await _harness.RoomService.SetConnectionStateAsync(guestSession, isConnected: false);

        _harness.Dice.Enqueue(6, 2);
        await _harness.GameService.StartMatchAsync(hostSession, Guid.NewGuid());

        // İki oyuncu da 6 dakika boyunca bağlı değil (grace = 5 dk).
        _harness.Time.Advance(TimeSpan.FromMinutes(6));
        await _harness.CleanupService.CleanupAsync();

        var act = () => _harness.RoomService.GetRoomStateAsync(hostSession);
        (await act.Should().ThrowAsync<GameDomainException>())
            .Which.Code.Should().Be(DomainErrorCodes.RoomExpired);
    }

    [Fact]
    public async Task Aktif_macta_tek_oyuncu_grace_suresini_asarsa_bagli_oyuncu_hukmen_kazanir()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 3));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        var hostSession = _harness.SessionFor(created.PlayerToken);
        var guestSession = _harness.SessionFor(joined.PlayerToken);

        await _harness.RoomService.SetConnectionStateAsync(hostSession, isConnected: true, connectionId: "host-conn");
        await _harness.RoomService.SetConnectionStateAsync(guestSession, isConnected: true, connectionId: "guest-conn");

        _harness.Dice.Enqueue(6, 2);
        await _harness.GameService.StartMatchAsync(hostSession, Guid.NewGuid());

        // Guest kopar ve 6 dakika boyunca dönmez; Host bağlıdır.
        await _harness.RoomService.SetConnectionStateAsync(guestSession, isConnected: false, connectionId: "guest-conn");
        _harness.Time.Advance(TimeSpan.FromMinutes(6));

        await _harness.CleanupService.CleanupAsync();

        var state = await _harness.RoomService.GetRoomStateAsync(hostSession);
        state.Status.Should().Be("Completed");
        state.Match!.Status.Should().Be("Completed");
        state.Match.WinnerPlayerId.Should().Be(hostSession.PlayerId);
    }

    [Fact]
    public async Task Bagli_oyunculari_olan_aktif_mac_temizlikte_kapatilmaz()
    {
        var created = await _harness.RoomService.CreateRoomAsync(new CreateRoomRequest("Ayşe", 1));
        var joined = await _harness.RoomService.JoinRoomAsync(created.RoomCode, new JoinRoomRequest("Fatma"));
        var hostSession = _harness.SessionFor(created.PlayerToken);
        var guestSession = _harness.SessionFor(joined.PlayerToken);

        await _harness.RoomService.SetConnectionStateAsync(hostSession, isConnected: true, connectionId: "host-active");
        await _harness.RoomService.SetConnectionStateAsync(guestSession, isConnected: true, connectionId: "guest-active");

        _harness.Dice.Enqueue(6, 2);
        await _harness.GameService.StartMatchAsync(hostSession, Guid.NewGuid());

        _harness.Time.Advance(TimeSpan.FromMinutes(15));
        await _harness.CleanupService.CleanupAsync();

        var state = await _harness.RoomService.GetRoomStateAsync(hostSession);
        state.Status.Should().Be("Playing");
        state.Match!.Status.Should().Be("InProgress");
    }
}

[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<SqlTestDatabase>;
