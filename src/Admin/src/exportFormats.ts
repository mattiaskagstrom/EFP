export type ExportFormat = {
  label: string;
  zones: (api: string, investigationId: string) => string;
  tracks: (api: string, investigationId: string) => string;
};

export const exportFormats: ExportFormat[] = [
  {
    label: 'GPX',
    zones: (api, investigationId) => `${api}/investigations/${investigationId}/zones.gpx`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.gpx`,
  },
  {
    label: 'Garmin GPX',
    zones: (api, investigationId) => `${api}/investigations/${investigationId}/zones.garmin.gpx`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.garmin.gpx`,
  },
  {
    label: 'GeoJSON',
    zones: (api, investigationId) => `${api}/investigations/${investigationId}/zones.geojson`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.geojson`,
  },
];
