import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TrackList, type Track } from './TrackList';
import './styles.css';

const track: Track = {
  id: 'track-1',
  callsign: 'Patrull 1',
  sourceFile: 'patrull-1.gpx',
  pod: 75,
  geometry: { type: 'LineString', coordinates: [[18, 59], [18.01, 59.01]] },
};

describe('TrackList', () => {
  it('expands track metadata when its header is clicked', () => {
    function Harness() {
      const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
      return <TrackList tracks={[track]} visibleTracks={{ 'track-1': true }} onVisibleChange={vi.fn()} selectedTrackId={null} expandedTrackId={expandedTrackId} onSelect={vi.fn()} onToggleExpanded={trackId => setExpandedTrackId(current => current === trackId ? null : trackId)} onUpdatePod={vi.fn()} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: /patrull-1\.gpx/i }));

    const details = screen.getByText('Filnamn').closest('.track-card-body');
    expect(details).toBeInTheDocument();
    expect(details).toBeVisible();
    expect(getComputedStyle(details as HTMLElement).display).toBe('grid');
    expect(screen.getByDisplayValue('75')).toBeInTheDocument();
  });
});
