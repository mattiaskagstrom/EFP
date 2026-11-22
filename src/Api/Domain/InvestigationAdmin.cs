using System.Text.Json.Serialization;

namespace Efp.Api.Domain;

public sealed class InvestigationAdmin
{
    public Guid InvestigationId { get; set; }
    [JsonIgnore]
    public Investigation? Investigation { get; set; }
    public Guid AdminId { get; set; }
    [JsonIgnore]
    public ApplicationUser? Admin { get; set; }
    public bool IsOwner { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
