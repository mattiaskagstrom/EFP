using System.Text.Json.Serialization;
using NetTopologySuite.Geometries;

namespace Efp.Api.Domain;

public sealed class Finding
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    public Investigation? Investigation { get; set; }
    public required string SubmittedBy { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset ObservedAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public required string ImageContentType { get; set; }
    public required string ImageFileName { get; set; }
    [JsonIgnore]
    public byte[] ImageData { get; set; } = [];
    public Point Geometry { get; set; } = default!;
    public bool IsDeleted { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}
