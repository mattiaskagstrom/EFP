import { describe, expect, it } from 'vitest';
import { filterZonesByName } from './zoneSearch';

describe('filterZonesByName', () => {
  const zones = [{ id: '1', name: 'Norra Sökzonen' }, { id: '2', name: 'Södra zonen' }];

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(filterZonesByName(zones, '  NORRA ')).toHaveLength(1);
    expect(filterZonesByName(zones, '  NORRA ')[0].id).toBe('1');
  });

  it('uses local draft names before persisted names', () => {
    expect(filterZonesByName(zones, 'nytt namn', { '1': 'Nytt namn' })).toHaveLength(1);
  });

  it('returns all zones for an empty query', () => {
    expect(filterZonesByName(zones, '')).toEqual(zones);
  });
});
