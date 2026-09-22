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
});
