import React from 'react';

export type Track = { id: string; callsign?: string; sourceFile?: string; pod?: number | null; geometry: { type: 'LineString'; coordinates: number[][] } };

type TrackListProps = {
  tracks: Track[];
  visibleTracks: Record<string, boolean>;
  onVisibleChange: (trackId: string, visible: boolean) => void;
  selectedTrackId: string | null;
  expandedTrackId: string | null;
  onSelect: (trackId: string) => void;
  onToggleExpanded: (trackId: string) => void;
  onUpdatePod: (track: Track, value: string) => void;
};

export function TrackList({ tracks, visibleTracks, onVisibleChange, selectedTrackId, expandedTrackId, onSelect, onToggleExpanded, onUpdatePod }: TrackListProps) {
  if (tracks.length === 0) return <p className="muted">Inga importerade spår.</p>;

  return <div className="track-list">{tracks.map(track => {
    const expanded = expandedTrackId === track.id;
    const selected = selectedTrackId === track.id;
    const label = track.sourceFile ?? track.callsign ?? 'GPX-import';
    return <article className={`track-card ${selected ? 'selected' : ''}`} key={track.id}>
      <button type="button" className="track-card-header" aria-expanded={expanded} onClick={event => { event.stopPropagation(); onSelect(track.id); onToggleExpanded(track.id); }}>
        <span>{label}</span>
        <span className="track-card-status">{track.pod !== null && track.pod !== undefined ? `POD ${track.pod}%` : 'POD ej angiven'}</span>
        <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && <div className="track-card-body" style={{ display: 'grid' }} onClick={event => event.stopPropagation()}>
        <label className="track-visibility"><input type="checkbox" checked={visibleTracks[track.id] ?? true} onChange={event => onVisibleChange(track.id, event.target.checked)} /> Visa spår i kartan</label>
        <label>Filnamn<span className="track-metadata-value">{track.sourceFile || 'Inte angivet'}</span></label>
        <label>Anropsnamn<span className="track-metadata-value">{track.callsign || 'Inte angivet'}</span></label>
        <label>POD (%)<input aria-label={`POD för ${label}`} type="number" min="0" max="100" step="0.1" value={track.pod ?? ''} placeholder="Inte angivet" onChange={event => onUpdatePod(track, event.target.value)} /></label>
      </div>}
    </article>;
  })}</div>;
}
