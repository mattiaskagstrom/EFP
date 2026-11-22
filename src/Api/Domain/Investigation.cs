using System.Text.Json.Serialization;

namespace Efp.Api.Domain;

public sealed class Investigation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public string? SearchConditions { get; set; }
    public bool IsPublic { get; set; } = true;
    [JsonIgnore]
    public string? AccessCodeHash { get; set; }
    [JsonIgnore]
    public string? AccessCode { get; set; }
    public int AccessCodeVersion { get; set; } = 1;
    public DateTimeOffset? AccessCodeUpdatedAt { get; set; }
    [JsonIgnore]
    public Guid? OwnerId { get; set; }
    [JsonIgnore]
    public ApplicationUser? Owner { get; set; }
    public InvestigationStatus Status { get; set; } = InvestigationStatus.Planned;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Sector> Sectors { get; set; } = [];
    public List<Track> Tracks { get; set; } = [];
    public List<Finding> Findings { get; set; } = [];
    public List<ReferencePoint> ReferencePoints { get; set; } = [];
    public List<InvestigationMap> Maps { get; set; } = [];
    [JsonIgnore]
    public List<InvestigationAdmin> Admins { get; set; } = [];
    [JsonIgnore]
    public List<UserSession> UserSessions { get; set; } = [];
}
