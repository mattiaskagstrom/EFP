using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace Efp.Api.ContractTests;

public sealed class ApiContractTests(ApiFactory factory) : IClassFixture<ApiFactory>, IAsyncLifetime
{
    private readonly HttpClient client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    public async Task InitializeAsync()
    {
        var login = await client.PostAsJsonAsync("/api/v1/auth/admin/login", new { username = "test-superadmin", password = "CorrectHorseBattery9" });
        login.EnsureSuccessStatusCode();
    }

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task Health_returns_ok()
    {
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OpenApi_is_available_and_contains_v1_paths()
    {
        var document = await client.GetFromJsonAsync<JsonElement>("/openapi/v1.json");
        var paths = document.GetProperty("paths");
        Assert.True(paths.TryGetProperty("/api/v1/investigations", out _));
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/sectors", out _));
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/tracks/import", out _));
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/findings", out _));
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/findings/{findingId}", out _));
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/findings.geojson", out _));
        Assert.True(paths.TryGetProperty("/api/v1/auth/admin/login", out _));
        Assert.True(paths.TryGetProperty("/api/v1/auth/user/connect", out _));
        Assert.True(paths.TryGetProperty("/api/v1/admin/user-sessions", out _));
        Assert.True(paths.TryGetProperty("/api/v1/admin/system", out _));
    }

    [Fact]
    public async Task Investigation_contract_supports_create_list_and_validation()
    {
        var invalid = await client.PostAsJsonAsync("/api/v1/investigations", new { name = " " });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var create = await client.PostAsJsonAsync("/api/v1/investigations", new { name = "Kontraktinsats", description = "Test" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        Assert.Equal("application/json", create.Content.Headers.ContentType?.MediaType);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        var id = created.GetProperty("id").GetGuid();
        Assert.Equal("Kontraktinsats", created.GetProperty("name").GetString());

        var list = await client.GetFromJsonAsync<JsonElement>("/api/v1/investigations");
        Assert.Contains(list.EnumerateArray(), item => item.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public async Task Investigation_contract_supports_editing_period_status_and_archiving()
    {
        var create = await client.PostAsJsonAsync("/api/v1/investigations", new { name = "Redigerbar insats", description = "Före ändring" });
        var id = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var update = await client.PatchAsJsonAsync($"/api/v1/investigations/{id}", new
        {
            name = "Uppdaterad insats",
            description = "Efter ändring",
            startsAt = "2026-09-22T08:00:00Z",
            endsAt = "2026-09-22T16:00:00Z",
            status = "Active",
        });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var updated = await update.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Uppdaterad insats", updated.GetProperty("name").GetString());
        Assert.Equal("Active", updated.GetProperty("status").GetString());
        Assert.Equal("2026-09-22T08:00:00+00:00", updated.GetProperty("startsAt").GetString());

        var archive = await client.PatchAsJsonAsync($"/api/v1/investigations/{id}", new { status = "Archived" });
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);
        Assert.Equal("Archived", (await archive.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());

        var invalidPeriod = await client.PatchAsJsonAsync($"/api/v1/investigations/{id}", new { startsAt = "2026-09-22T17:00:00Z", endsAt = "2026-09-22T16:00:00Z" });
        Assert.Equal(HttpStatusCode.BadRequest, invalidPeriod.StatusCode);
    }

    [Fact]
    public async Task Sector_contract_supports_geometry_metadata_and_soft_delete()
    {
        var investigation = await CreateInvestigation();
        var payload = new
        {
            name = "Sektor A",
            status = "NotStarted",
            searchMethod = "Patrol",
            priority = 1,
            searched = false,
            points = 3,
            showName = true,
            showArea = false,
            geometry = new { coordinates = new[] { new[] { 18.0, 59.0 }, new[] { 18.01, 59.0 }, new[] { 18.0, 59.01 } } },
        };
        var create = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/sectors", payload);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        var sectorId = created.GetProperty("id").GetGuid();
        Assert.True(created.GetProperty("areaKm2").GetDouble() > 0);
        Assert.Equal("Patrol", created.GetProperty("searchMethod").GetString());

        var selectedExport = await client.GetAsync($"/api/v1/investigations/{investigation}/sectors.geojson?sectorIds={sectorId}");
        Assert.Equal(HttpStatusCode.OK, selectedExport.StatusCode);
        Assert.Contains(sectorId.ToString(), await selectedExport.Content.ReadAsStringAsync());

        var invalid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/sectors", new { payload.name, payload.status, payload.searchMethod, payload.priority, geometry = new { coordinates = new[] { new[] { 18.0, 59.0 }, new[] { 18.01, 59.0 } } } });
        Assert.Equal(HttpStatusCode.Created, invalid.StatusCode);
        var lineSector = await invalid.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("LineString", lineSector.GetProperty("geometry").GetProperty("type").GetString());

        var invalidExportPeriod = await client.GetAsync($"/api/v1/investigations/{investigation}/tracks.geojson?from=2026-09-22T16:00:00Z&to=2026-09-22T08:00:00Z");
        Assert.Equal(HttpStatusCode.BadRequest, invalidExportPeriod.StatusCode);

        var delete = await client.DeleteAsync($"/api/v1/investigations/{investigation}/sectors/{sectorId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        var sectors = await client.GetFromJsonAsync<JsonElement>($"/api/v1/investigations/{investigation}/sectors");
        Assert.DoesNotContain(sectors.EnumerateArray(), item => item.GetProperty("id").GetGuid() == sectorId);
    }

    [Fact]
    public async Task Reference_point_contract_validates_coordinates()
    {
        var investigation = await CreateInvestigation();
        var invalid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/reference-points", new { type = "Pls", label = "Ogiltig", longitude = 181, latitude = 59 });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var valid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/reference-points", new { type = "Pls", label = "PLS", longitude = 18, latitude = 59 });
        Assert.Equal(HttpStatusCode.Created, valid.StatusCode);
        var created = await valid.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(18, created.GetProperty("longitude").GetDouble());
        Assert.Equal(59, created.GetProperty("latitude").GetDouble());
    }

    [Fact]
    public async Task Superadmin_system_overview_returns_statistics_and_safe_parameters()
    {
        var response = await client.GetAsync("/api/v1/admin/system");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("statistics").GetProperty("investigations").TryGetInt32(out _));
        Assert.True(body.GetProperty("parameters").TryGetProperty("apiVersion", out _));
        Assert.False(body.ToString().Contains("Password", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task Admin_can_register_login_and_read_current_identity()
    {
        var username = $"admin-{Guid.NewGuid():N}";
        var register = await client.PostAsJsonAsync("/api/v1/auth/admin/register", new { username, password = "CorrectHorseBattery9" });
        Assert.Equal(HttpStatusCode.Created, register.StatusCode);

        var login = await client.PostAsJsonAsync("/api/v1/auth/admin/login", new { username, password = "CorrectHorseBattery9" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/admin/me");
        Assert.Equal(username, me.GetProperty("userName").GetString());
        Assert.Contains("Admin", me.GetProperty("roles").EnumerateArray().Select(item => item.GetString()));
    }

    [Fact]
    public async Task Public_user_connection_returns_token_and_can_read_session()
    {
        var investigation = await CreateInvestigation();
        var connect = await client.PostAsJsonAsync("/api/v1/auth/user/connect", new { investigationId = investigation, callsign = "Alfa 1", code = (string?)null });
        Assert.Equal(HttpStatusCode.OK, connect.StatusCode);
        var connection = await connect.Content.ReadFromJsonAsync<JsonElement>();
        var token = connection.GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/user/session");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        var session = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        Assert.Equal("Alfa 1", (await session.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("callsign").GetString());
    }

    [Fact]
    public async Task Private_investigation_requires_code_and_rotation_invalidates_session()
    {
        var create = await client.PostAsJsonAsync("/api/v1/investigations", new { name = "Privat kontraktinsats", isPublic = false });
        var investigation = (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var denied = await client.PostAsJsonAsync("/api/v1/auth/user/connect", new { investigationId = investigation, callsign = "Bravo", code = "ABCDEFGH" });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var rotated = await client.PostAsync($"/api/v1/investigations/{investigation}/access-code/rotate", null);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var code = (await rotated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();
        var connected = await client.PostAsJsonAsync("/api/v1/auth/user/connect", new { investigationId = investigation, callsign = "Bravo", code });
        Assert.Equal(HttpStatusCode.OK, connected.StatusCode);
        var token = (await connected.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString();
        var secondRotation = await client.PostAsync($"/api/v1/investigations/{investigation}/access-code/rotate", null);
        Assert.Equal(HttpStatusCode.OK, secondRotation.StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/auth/user/session");
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task Sector_gpx_import_preserves_open_police_underlay_as_line_sector()
    {
        var investigation = await CreateInvestigation();
        const string gpx = """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
              <trk><trkseg>
                <trkpt lat="59.0000" lon="18.0000" />
                <trkpt lat="59.0100" lon="18.0100" />
                <trkpt lat="59.0200" lon="18.0000" />
              </trkseg></trk>
            </gpx>
            """;
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(gpx, Encoding.UTF8, "application/gpx+xml"), "file", "police-underlay.gpx");

        var import = await client.PostAsync($"/api/v1/investigations/{investigation}/sectors/import", content);
        Assert.Equal(HttpStatusCode.Created, import.StatusCode);

        var sectors = await client.GetFromJsonAsync<JsonElement>($"/api/v1/investigations/{investigation}/sectors");
        var sector = Assert.Single(sectors.EnumerateArray());
        Assert.Equal("LineString", sector.GetProperty("geometry").GetProperty("type").GetString());
        Assert.Contains("linjeunderlag", sector.GetProperty("instructions").GetString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Track_import_accepts_metadata_and_lists_uploaded_track()
    {
        var investigation = await CreateInvestigation();
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent("<gpx><trk><trkseg><trkpt lat=\"59\" lon=\"18\"/><trkpt lat=\"59.01\" lon=\"18.01\"/></trkseg></trk></gpx>", Encoding.UTF8, "application/gpx+xml"), "file", "alfa.gpx");
        content.Add(new StringContent("Alfa 1"), "callsign");
        content.Add(new StringContent("75"), "pod");
        content.Add(new StringContent("Patrull Alfa"), "assignedGroup");
        content.Add(new StringContent("POD noterad vid avslut."), "notes");

        var import = await client.PostAsync($"/api/v1/investigations/{investigation}/tracks/import", content);
        Assert.Equal(HttpStatusCode.Created, import.StatusCode);
        var created = await import.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Alfa 1", created.GetProperty("callsign").GetString());
        Assert.Equal("Patrull Alfa", created.GetProperty("assignedGroup").GetString());
        Assert.Equal(75, created.GetProperty("pod").GetDouble());

        var history = await client.GetFromJsonAsync<JsonElement>($"/api/v1/investigations/{investigation}/tracks?callsign=Alfa%201");
        var track = Assert.Single(history.EnumerateArray());
        Assert.Equal("alfa.gpx", track.GetProperty("sourceFile").GetString());
        Assert.Equal("POD noterad vid avslut.", track.GetProperty("notes").GetString());

        var sectorCreate = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/sectors", new
        {
            name = "Norra sektorn",
            status = "NotStarted",
            searchMethod = "Patrol",
            priority = 1,
            geometry = new { type = "Polygon", coordinates = new[] { new[] { 17.999, 58.999 }, new[] { 18.002, 58.999 }, new[] { 17.999, 59.002 } } },
        });
        sectorCreate.EnsureSuccessStatusCode();
        var sectorId = (await sectorCreate.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var selectedTracks = await client.GetAsync($"/api/v1/investigations/{investigation}/tracks.geojson?sectorIds={sectorId}");
        Assert.Equal(HttpStatusCode.OK, selectedTracks.StatusCode);
        Assert.Contains(track.GetProperty("id").GetGuid().ToString(), await selectedTracks.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Export_contracts_return_expected_content_types()
    {
        var investigation = await CreateInvestigation();
        var gpx = await client.GetAsync($"/api/v1/investigations/{investigation}/tracks.gpx");
        var sectorsGpx = await client.GetAsync($"/api/v1/investigations/{investigation}/sectors.gpx");
        var garminGpx = await client.GetAsync($"/api/v1/investigations/{investigation}/sectors.garmin.gpx");
        var garminTracksGpx = await client.GetAsync($"/api/v1/investigations/{investigation}/tracks.garmin.gpx");
        var geoJson = await client.GetAsync($"/api/v1/investigations/{investigation}/sectors.geojson");
        Assert.Equal("application/gpx+xml", gpx.Content.Headers.ContentType?.MediaType);
        Assert.Contains("creator=\"EFP Garmin export\"", await sectorsGpx.Content.ReadAsStringAsync());
        Assert.Equal("application/gpx+xml", garminGpx.Content.Headers.ContentType?.MediaType);
        Assert.Contains("creator=\"EFP Garmin export\"", await garminGpx.Content.ReadAsStringAsync());
        Assert.Equal("application/gpx+xml", garminTracksGpx.Content.Headers.ContentType?.MediaType);
        Assert.Equal("application/json", geoJson.Content.Headers.ContentType?.MediaType);
        Assert.Contains("FeatureCollection", await geoJson.Content.ReadAsStringAsync());
    }

    private async Task<Guid> CreateInvestigation()
    {
        var response = await client.PostAsJsonAsync("/api/v1/investigations", new { name = $"Test {Guid.NewGuid():N}", description = (string?)null });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
    }
}
