import { describe, expect, it } from 'vitest';
import { exportFormats } from './exportFormats';

describe('exportFormats', () => {
  it('uses the same format order for zones and tracks', () => {
    const api = '/api/v1';
    const investigationId = 'investigation-1';

    expect(exportFormats.map(format => format.label)).toEqual(['GPX', 'Garmin GPX', 'GeoJSON']);
    expect(exportFormats.map(format => format.zones(api, investigationId).split('/').pop())).toEqual([
      'zones.gpx',
      'zones.garmin.gpx',
      'zones.geojson',
    ]);
    expect(exportFormats.map(format => format.tracks(api, investigationId).split('/').pop())).toEqual([
      'tracks.gpx',
      'tracks.garmin.gpx',
      'tracks.geojson',
    ]);
  });
});
