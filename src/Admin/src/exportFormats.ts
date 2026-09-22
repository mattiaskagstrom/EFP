export type ExportFormat = {
  label: string;
  sectors: (api: string, investigationId: string, selection?: ExportSelection) => string;
  tracks: (api: string, investigationId: string, selection?: ExportSelection) => string;
};

export type ExportSelection = {
  sectorIds?: string[];
  trackIds?: string[];
  from?: string;
  to?: string;
};

function addSelection(url: string, selection?: ExportSelection): string {
  if (!selection) return url;
  const query = new URLSearchParams();
  selection.sectorIds?.forEach(id => query.append('sectorIds', id));
  selection.trackIds?.forEach(id => query.append('trackIds', id));
  if (selection.from) query.set('from', selection.from);
  if (selection.to) query.set('to', selection.to);
  const queryString = query.toString();
  return queryString ? `${url}?${queryString}` : url;
}

export const exportFormats: ExportFormat[] = [
  {
    label: 'GPX',
    sectors: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/sectors.gpx`, selection),
    tracks: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/tracks.gpx`, selection),
  },
  {
    label: 'Garmin GPX',
    sectors: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/sectors.garmin.gpx`, selection),
    tracks: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/tracks.garmin.gpx`, selection),
  },
  {
    label: 'GeoJSON',
    sectors: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/sectors.geojson`, selection),
    tracks: (api, investigationId, selection) => addSelection(`${api}/investigations/${investigationId}/tracks.geojson`, selection),
  },
];
