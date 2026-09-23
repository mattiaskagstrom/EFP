using System.Globalization;
using System.Xml.Linq;
using Efp.Api.Data;
using Efp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NetTopologySuite;
using NetTopologySuite.Geometries;

namespace Efp.Api.Features;

public static class FindingEndpoints
{
    private static readonly HashSet<string> ImageTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long MaxImageBytes = 10 * 1024 * 1024;

    public static IEndpointRouteBuilder MapFindingEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/investigations/{investigationId:guid}");
        group.MapGet("/findings", ListAsync);
        group.MapPost("/findings", CreateAsync).DisableAntiforgery();
        group.MapGet("/findings/{findingId:guid}/image", ImageAsync);
        group.MapGet("/findings.geojson", ExportGeoJsonAsync);
        group.MapGet("/findings.gpx", ExportGpxAsync);
        group.MapGet("/findings.garmin.gpx", ExportGpxAsync);
        return endpoints;
    }

    private static async Task<IResult> CreateAsync(Guid investigationId, IFormFile image, [FromForm] double longitude, [FromForm] double latitude, [FromForm] DateTimeOffset? observedAt, [FromForm] string? description, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (!await db.Investigations.AnyAsync(x => x.Id == investigationId, ct)) return Results.NotFound("Investigation not found.");
        if (image is null || image.Length == 0 || image.Length > MaxImageBytes) return Results.ValidationProblem(new Dictionary<string, string[]> { ["image"] = ["Bilden måste vara mellan 1 byte och 10 MB."] });
        if (!ImageTypes.Contains(image.ContentType.ToLowerInvariant())) return Results.ValidationProblem(new Dictionary<string, string[]> { ["image"] = ["Bilden måste vara JPEG, PNG eller WebP."] });
        if (!double.IsFinite(longitude) || longitude is < -180 or > 180 || !double.IsFinite(latitude) || latitude is < -90 or > 90) return Results.ValidationProblem(new Dictionary<string, string[]> { ["geometry"] = ["Positionen är ogiltig."] });

        var submittedBy = http.User.Identity?.IsAuthenticated == true
            ? http.User.Identity.Name ?? "Admin"
            : (await UserSessionService.FindAsync(http, db, ct))?.Callsign;
        if (string.IsNullOrWhiteSpace(submittedBy)) return Results.Unauthorized();
        await using var stream = image.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, ct);
        var geometry = NtsGeometryServices.Instance.CreateGeometryFactory(srid: 4326).CreatePoint(new Coordinate(longitude, latitude));
        var finding = new Finding { InvestigationId = investigationId, SubmittedBy = submittedBy.Trim(), Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim(), ObservedAt = observedAt ?? DateTimeOffset.UtcNow, ImageContentType = image.ContentType.ToLowerInvariant(), ImageFileName = Path.GetFileName(image.FileName), ImageData = memory.ToArray(), Geometry = geometry };
        db.Findings.Add(finding);
        await db.SaveChangesAsync(ct);
        return Results.Created($"/api/v1/investigations/{investigationId}/findings/{finding.Id}", ToSummary(finding, investigationId));
    }

    private static async Task<IResult> ListAsync(Guid investigationId, [FromQuery] Guid[]? sectorIds, [FromQuery(Name = "from")] DateTimeOffset? fromDate, [FromQuery(Name = "to")] DateTimeOffset? toDate, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (fromDate > toDate) return Results.BadRequest("Exportens starttid måste vara före sluttiden.");
        var findings = await FilterAsync(investigationId, sectorIds, fromDate, toDate, db, ct);
        return Results.Ok(findings.Select(f => ToSummary(f, investigationId)));
    }

    private static async Task<IResult> ImageAsync(Guid investigationId, Guid findingId, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        var finding = await db.Findings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == findingId && x.InvestigationId == investigationId, ct);
        return finding is null ? Results.NotFound() : Results.File(finding.ImageData, finding.ImageContentType, finding.ImageFileName);
    }

    private static async Task<IResult> ExportGeoJsonAsync(Guid investigationId, [FromQuery] Guid[]? findingIds, [FromQuery] Guid[]? sectorIds, [FromQuery(Name = "from")] DateTimeOffset? fromDate, [FromQuery(Name = "to")] DateTimeOffset? toDate, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (fromDate > toDate) return Results.BadRequest("Exportens starttid måste vara före sluttiden.");
        var findings = await FilterAsync(investigationId, sectorIds, fromDate, toDate, db, ct, findingIds);
        var features = findings.Select(f => new { type = "Feature", id = f.Id, properties = new { f.SubmittedBy, f.Description, f.ObservedAt, f.SubmittedAt, ImageUrl = $"/api/v1/investigations/{investigationId}/findings/{f.Id}/image" }, geometry = new { type = "Point", coordinates = new[] { f.Geometry.X, f.Geometry.Y } } });
        return Results.Json(new { type = "FeatureCollection", features });
    }

    private static async Task<IResult> ExportGpxAsync(Guid investigationId, [FromQuery] Guid[]? findingIds, [FromQuery] Guid[]? sectorIds, [FromQuery(Name = "from")] DateTimeOffset? fromDate, [FromQuery(Name = "to")] DateTimeOffset? toDate, EfpDbContext db, HttpContext http, CancellationToken ct)
    {
        if (!await InvestigationAccessEndpoints.CanAccessAsync(investigationId, http, db, ct)) return Results.Unauthorized();
        if (fromDate > toDate) return Results.BadRequest("Exportens starttid måste vara före sluttiden.");
        var findings = await FilterAsync(investigationId, sectorIds, fromDate, toDate, db, ct, findingIds);
        var ns = XNamespace.Get("http://www.topografix.com/GPX/1/1");
        var root = new XElement(ns + "gpx", new XAttribute("version", "1.1"), new XAttribute("creator", "EFP"));
        foreach (var finding in findings)
        {
            root.Add(new XElement(ns + "wpt", new XAttribute("lat", finding.Geometry.Y.ToString(CultureInfo.InvariantCulture)), new XAttribute("lon", finding.Geometry.X.ToString(CultureInfo.InvariantCulture)), new XElement(ns + "name", $"Fynd från {finding.SubmittedBy}"), new XElement(ns + "time", finding.ObservedAt.UtcDateTime.ToString("O", CultureInfo.InvariantCulture)), new XElement(ns + "cmt", finding.Description ?? "")));
        }
        return Results.Text(new XDocument(new XDeclaration("1.0", "utf-8", "yes"), root).ToString(), "application/gpx+xml");
    }

    private static async Task<List<Finding>> FilterAsync(Guid investigationId, Guid[]? sectorIds, DateTimeOffset? fromDate, DateTimeOffset? toDate, EfpDbContext db, CancellationToken ct, Guid[]? findingIds = null)
    {
        var query = db.Findings.AsNoTracking().Where(x => x.InvestigationId == investigationId);
        if (findingIds is { Length: > 0 }) query = query.Where(x => findingIds.Contains(x.Id));
        if (fromDate.HasValue) query = query.Where(x => x.ObservedAt >= fromDate);
        if (toDate.HasValue) query = query.Where(x => x.ObservedAt <= toDate);
        if (sectorIds is { Length: > 0 })
        {
            var sectors = await db.Sectors.AsNoTracking().Where(x => x.InvestigationId == investigationId && sectorIds.Contains(x.Id)).Select(x => x.Geometry).ToListAsync(ct);
            if (sectors.Count == 0) return [];
            var all = await query.OrderByDescending(x => x.ObservedAt).ToListAsync(ct);
            return all.Where(f => sectors.Any(s => f.Geometry.Intersects(s))).ToList();
        }
        return await query.OrderByDescending(x => x.ObservedAt).ToListAsync(ct);
    }

    private static object ToSummary(Finding finding, Guid investigationId) => new { finding.Id, finding.SubmittedBy, finding.Description, finding.ObservedAt, finding.SubmittedAt, ImageUrl = $"/api/v1/investigations/{investigationId}/findings/{finding.Id}/image", Longitude = finding.Geometry.X, Latitude = finding.Geometry.Y };
}
