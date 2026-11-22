using NetTopologySuite.Geometries;

namespace Efp.Api.Domain;

public sealed class Sector
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public required string Name { get; set; }
    public string? Instructions { get; set; }
    public SectorStatus Status { get; set; } = SectorStatus.NotStarted;
    public SearchMethod SearchMethod { get; set; } = SearchMethod.Patrol;
    public int Priority { get; set; }
    public string? AssignedGroup { get; set; }
    public bool Searched { get; set; }
    public DateTimeOffset? SearchedAt { get; set; }
    public int Points { get; set; }
    public bool ShowName { get; set; }
    public bool ShowArea { get; set; }
    public double? Poa { get; set; }
    public bool IsDeleted { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Geometry Geometry { get; set; } = default!;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
