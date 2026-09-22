export type ExportFormat = {
  label: string;
  sectors: (api: string, investigationId: string) => string;
  tracks: (api: string, investigationId: string) => string;
};

export const exportFormats: ExportFormat[] = [
  {
    label: 'GPX',
    sectors: (api, investigationId) => `${api}/investigations/${investigationId}/sectors.gpx`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.gpx`,
  },
  {
    label: 'Garmin GPX',
    sectors: (api, investigationId) => `${api}/investigations/${investigationId}/sectors.garmin.gpx`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.garmin.gpx`,
  },
  {
    label: 'GeoJSON',
    sectors: (api, investigationId) => `${api}/investigations/${investigationId}/sectors.geojson`,
    tracks: (api, investigationId) => `${api}/investigations/${investigationId}/tracks.geojson`,
  },
];
