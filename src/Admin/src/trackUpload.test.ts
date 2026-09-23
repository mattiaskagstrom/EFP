import { describe, expect, it } from 'vitest';
import { validateTrackFile } from './trackUpload';

describe('validateTrackFile', () => {
  it('accepts a GPX with at least two track points', async () => {
    const file = { name: 'patrull.gpx', size: 120, text: async () => '<gpx><trk><trkseg><trkpt lat="59" lon="18"/><trkpt lat="59.1" lon="18.1"/></trkseg></trk></gpx>' } as File;
    await expect(validateTrackFile(file)).resolves.toEqual({ valid: true });
  });

  it('rejects a GPX without enough track points before upload', async () => {
    const file = { name: 'patrull.gpx', size: 80, text: async () => '<gpx><trk><trkseg><trkpt lat="59" lon="18"/></trkseg></trk></gpx>' } as File;
    await expect(validateTrackFile(file)).resolves.toEqual({ valid: false, message: expect.stringContaining('två') });
  });
});
