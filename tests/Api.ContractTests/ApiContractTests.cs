using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;

namespace Efp.Api.ContractTests;

public sealed class ApiContractTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private readonly HttpClient client = factory.CreateClient();

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
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

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
