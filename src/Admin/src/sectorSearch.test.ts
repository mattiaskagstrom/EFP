import { describe, expect, it } from 'vitest';
import { filterSectorsByName } from './sectorSearch';

describe('filterSectorsByName', () => {
  const sectors = [{ id: '1', name: 'Norra Söksektorn' }, { id: '2', name: 'Södra sektorn' }];

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(filterSectorsByName(sectors, '  NORRA ')).toHaveLength(1);
    expect(filterSectorsByName(sectors, '  NORRA ')[0].id).toBe('1');
  });

  it('uses local draft names before persisted names', () => {
    expect(filterSectorsByName(sectors, 'nytt namn', { '1': 'Nytt namn' })).toHaveLength(1);
  });

  it('returns all sectors for an empty query', () => {
    expect(filterSectorsByName(sectors, '')).toEqual(sectors);
  });
});
