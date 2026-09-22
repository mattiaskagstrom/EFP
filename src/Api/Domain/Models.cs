using NetTopologySuite.Geometries;

namespace Efp.Api.Domain;

public enum InvestigationStatus { Planned, Active, Paused, Closed, Archived }
public enum SectorStatus { NotStarted, Assigned, InProgress, Complete, NeedsReview }
public enum SearchMethod { Patrol, SearchChain, Handrail }
public enum ReferencePointType { Pls, Lkp, Ipp }

public sealed class Investigation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public string? SearchConditions { get; set; }
    public InvestigationStatus Status { get; set; } = InvestigationStatus.Planned;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Sector> Sectors { get; set; } = [];
    public List<Track> Tracks { get; set; } = [];
    public List<ReferencePoint> ReferencePoints { get; set; } = [];
}

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

public sealed class Track
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public required string Callsign { get; set; }
    public string? SourceFile { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public double? Pod { get; set; }
    public LineString Geometry { get; set; } = default!;
    public DateTimeOffset ImportedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ReferencePoint
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public ReferencePointType Type { get; set; }
    public required string Label { get; set; }
    public Point Geometry { get; set; } = default!;
}
