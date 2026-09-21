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
        Assert.True(paths.TryGetProperty("/api/v1/investigations/{investigationId}/zones", out _));
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
    public async Task Zone_contract_supports_geometry_metadata_and_soft_delete()
    {
        var investigation = await CreateInvestigation();
        var payload = new
        {
            name = "Zon A",
            status = "NotStarted",
            searchMethod = "Patrol",
            priority = 1,
            searched = false,
            points = 3,
            showName = true,
            showArea = false,
            geometry = new { coordinates = new[] { new[] { 18.0, 59.0 }, new[] { 18.01, 59.0 }, new[] { 18.0, 59.01 } } },
        };
        var create = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/zones", payload);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var created = await create.Content.ReadFromJsonAsync<JsonElement>();
        var zoneId = created.GetProperty("id").GetGuid();
        Assert.True(created.GetProperty("areaKm2").GetDouble() > 0);
        Assert.Equal("Patrol", created.GetProperty("searchMethod").GetString());

        var invalid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/zones", new { payload.name, payload.status, payload.searchMethod, payload.priority, geometry = new { coordinates = new[] { new[] { 18.0, 59.0 }, new[] { 18.01, 59.0 } } } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var delete = await client.DeleteAsync($"/api/v1/investigations/{investigation}/zones/{zoneId}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
        var zones = await client.GetFromJsonAsync<JsonElement>($"/api/v1/investigations/{investigation}/zones");
        Assert.DoesNotContain(zones.EnumerateArray(), item => item.GetProperty("id").GetGuid() == zoneId);
    }

    [Fact]
    public async Task Reference_point_contract_validates_coordinates()
    {
        var investigation = await CreateInvestigation();
        var invalid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/reference-points", new { type = "Pls", label = "Ogiltig", longitude = 181, latitude = 59 });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var valid = await client.PostAsJsonAsync($"/api/v1/investigations/{investigation}/reference-points", new { type = "Pls", label = "PLS", longitude = 18, latitude = 59 });
        Assert.Equal(HttpStatusCode.Created, valid.StatusCode);
    }

    [Fact]
    public async Task Export_contracts_return_expected_content_types()
    {
        var investigation = await CreateInvestigation();
        var gpx = await client.GetAsync($"/api/v1/investigations/{investigation}/tracks.gpx");
        var zonesGpx = await client.GetAsync($"/api/v1/investigations/{investigation}/zones.gpx");
        var garminGpx = await client.GetAsync($"/api/v1/investigations/{investigation}/zones.garmin.gpx");
        var geoJson = await client.GetAsync($"/api/v1/investigations/{investigation}/zones.geojson");
        Assert.Equal("application/gpx+xml", gpx.Content.Headers.ContentType?.MediaType);
        Assert.Contains("creator=\"EFP Garmin export\"", await zonesGpx.Content.ReadAsStringAsync());
        Assert.Equal("application/gpx+xml", garminGpx.Content.Headers.ContentType?.MediaType);
        Assert.Contains("creator=\"EFP Garmin export\"", await garminGpx.Content.ReadAsStringAsync());
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
