using NetTopologySuite.Geometries;

namespace Efp.Api.Domain;

public sealed class ReferencePoint
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public ReferencePointType Type { get; set; }
    public required string Label { get; set; }
    public Point Geometry { get; set; } = default!;
}
