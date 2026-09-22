import { describe, expect, it } from 'vitest';
import { exportFormats } from './exportFormats';

describe('exportFormats', () => {
  it('uses the same format order for sectors and tracks', () => {
    const api = '/api/v1';
    const investigationId = 'investigation-1';

    expect(exportFormats.map(format => format.label)).toEqual(['GPX', 'Garmin GPX', 'GeoJSON']);
    expect(exportFormats.map(format => format.sectors(api, investigationId).split('/').pop())).toEqual([
      'sectors.gpx',
      'sectors.garmin.gpx',
      'sectors.geojson',
    ]);
    expect(exportFormats.map(format => format.tracks(api, investigationId).split('/').pop())).toEqual([
      'tracks.gpx',
      'tracks.garmin.gpx',
      'tracks.geojson',
    ]);
  });

  it('adds sector, track and period filters to export links', () => {
    const url = exportFormats[2].tracks('/api/v1', 'investigation-1', {
      sectorIds: ['sector-1'],
      trackIds: ['track-1', 'track-2'],
      from: '2026-09-22T08:00:00.000Z',
      to: '2026-09-22T16:00:00.000Z',
    });
    const query = new URL(url, 'https://example.test').searchParams;
    expect(query.getAll('sectorIds')).toEqual(['sector-1']);
    expect(query.getAll('trackIds')).toEqual(['track-1', 'track-2']);
    expect(query.get('from')).toBe('2026-09-22T08:00:00.000Z');
    expect(query.get('to')).toBe('2026-09-22T16:00:00.000Z');
  });
});
