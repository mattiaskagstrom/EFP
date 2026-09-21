using Efp.Api.Domain;
using Xunit;

namespace Efp.Api.UnitTests;

public sealed class DomainContractTests
{
    [Fact]
    public void Zone_defaults_are_safe_for_new_zones()
    {
        var zone = new Zone { Name = "Test" };
        Assert.Equal(ZoneStatus.NotStarted, zone.Status);
        Assert.Equal(SearchMethod.Patrol, zone.SearchMethod);
        Assert.False(zone.Searched);
        Assert.False(zone.IsDeleted);
        Assert.Null(zone.DeletedAt);
    }

    [Fact]
    public void Public_enum_values_remain_stable()
    {
        Assert.Equal(["NotStarted", "Assigned", "InProgress", "Complete", "NeedsReview"], Enum.GetNames<ZoneStatus>());
        Assert.Equal(["Patrol", "SearchChain", "Handrail"], Enum.GetNames<SearchMethod>());
        Assert.Equal(["Pls", "Lkp", "Ipp"], Enum.GetNames<ReferencePointType>());
    }
}
