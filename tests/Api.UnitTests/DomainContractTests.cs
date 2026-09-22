using Efp.Api.Domain;
using Xunit;

namespace Efp.Api.UnitTests;

public sealed class DomainContractTests
{
    [Fact]
    public void Sector_defaults_are_safe_for_new_sectors()
    {
        var sector = new Sector { Name = "Test" };
        Assert.Equal(SectorStatus.NotStarted, sector.Status);
        Assert.Equal(SearchMethod.Patrol, sector.SearchMethod);
        Assert.False(sector.Searched);
        Assert.False(sector.IsDeleted);
        Assert.Null(sector.DeletedAt);
    }

    [Fact]
    public void Public_enum_values_remain_stable()
    {
        Assert.Equal(["NotStarted", "Assigned", "InProgress", "Complete", "NeedsReview"], Enum.GetNames<SectorStatus>());
        Assert.Equal(["Patrol", "SearchChain", "Handrail"], Enum.GetNames<SearchMethod>());
        Assert.Equal(["Pls", "Lkp", "Ipp"], Enum.GetNames<ReferencePointType>());
    }
}
