using NetTopologySuite.Geometries;

namespace Efp.Api.Domain;

public sealed class Track
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public required string Callsign { get; set; }
    public string? SourceFile { get; set; }
    public string? AssignedGroup { get; set; }
    public Guid? SectorId { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public double? Pod { get; set; }
    public LineString Geometry { get; set; } = default!;
    public DateTimeOffset ImportedAt { get; set; } = DateTimeOffset.UtcNow;
}
