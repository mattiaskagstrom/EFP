using System.Text.Json.Serialization;

namespace Efp.Api.Domain;

public sealed class UserSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InvestigationId { get; set; }
    [JsonIgnore]
    public Investigation? Investigation { get; set; }
    public required string TokenHash { get; set; }
    public required string Callsign { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastSeenAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAt { get; set; }
    public int AccessCodeVersion { get; set; }
}
