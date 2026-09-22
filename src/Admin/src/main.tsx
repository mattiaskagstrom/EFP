import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { featureCollection } from '@turf/helpers';
import polygonToLine from '@turf/polygon-to-line';
import polygonize from '@turf/polygonize';
import polygonUnion from '@turf/union';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { filterZonesByName } from './zoneSearch';
import { InvestigationEditButton } from './InvestigationEditButton';
import { exportFormats } from './exportFormats';

type Investigation = { id: string; name: string; status: string; description?: string | null; startsAt?: string | null; endsAt?: string | null; searchConditions?: string | null };
type ReferencePoint = { id: string; type: 'Pls' | 'Lkp' | 'Ipp'; label: string; longitude: number; latitude: number };
type Zone = { id: string; name: string; status: string; priority: number; searched: boolean; searchedAt?: string | null; points: number; showName: boolean; showArea: boolean; poa?: number | null; areaKm2?: number; lengthKm?: number; geometry: { type?: 'Polygon' | 'LineString'; coordinates: number[][] } };
type Track = { id: string; callsign?: string; sourceFile?: string; pod?: number | null; geometry: { type: 'LineString'; coordinates: number[][] } };
type DrawMode = 'Polygon' | 'Rectangle' | 'Circle' | 'Line';
type ActiveTool = 'none' | DrawMode | 'Text' | 'Edit' | 'Drag' | 'Remove' | 'Split' | 'Merge';
type MapType = 'osm' | 'topographic' | 'satellite';
type StrokeStyle = 'solid' | 'dash' | 'dot' | 'dashdot';
type DrawingSnapshot = { kind: 'shape' | 'text'; shape?: string; geometry?: GeoJSON.Geometry; radius?: number; zoneId?: string; zone?: Partial<Zone>; style?: { color: string; weight: number; dashArray?: string }; text?: string; lat?: number; lng?: number };
type ZoneDetails = Pick<Zone, 'name' | 'searched' | 'searchedAt' | 'points' | 'showName' | 'showArea' | 'poa'>;
type EditorApi = { draw: (mode: DrawMode) => void; text: () => void; edit: () => void; drag: () => void; remove: () => void; removeZone: (zoneId: string) => void; split: () => void; merge: () => void; placeReferencePoint: (type: ReferencePoint['type']) => void; stop: () => void; undo: () => void; redo: () => void; save: () => Promise<void>; discard: () => void; updateZoneDetails: (zoneId: string, details: ZoneDetails) => void; simplifyZone: (zoneId: string, toleranceMeters: number) => void; latestPolygon: () => number[][] | null; canUndo: () => boolean; canRedo: () => boolean };

const API = import.meta.env.VITE_API_URL ?? '/api/v1';
const center: [number, number] = [59.33, 18.06];
const strokeMap: Record<StrokeStyle, string | undefined> = { solid: undefined, dash: '12 8', dot: '2 8', dashdot: '12 6 2 6' };
const toDateTimeLocal = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '';
const investigationStatusLabel = (status: string) => ({ Planned: 'Planerad', Active: 'Aktiv', Paused: 'Pausad', Closed: 'Avslutad', Archived: 'Arkiverad' }[status] ?? status);

function App() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState<Investigation | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [referencePoints, setReferencePoints] = useState<ReferencePoint[]>([]);
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, ZoneDetails>>({});
  const [tracks, setTracks] = useState<Track[]>([]);
  const [visibleTracks, setVisibleTracks] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [mapType, setMapType] = useState<MapType>('osm');
  const [error, setError] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);
  const [simplifyTolerance, setSimplifyTolerance] = useState(5);
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Record<string, boolean>>({});
  const [zonesExpanded, setZonesExpanded] = useState(true);
  const [zoneSearch, setZoneSearch] = useState('');
  const [investigationDraft, setInvestigationDraft] = useState({ name: '', description: '', startsAt: '', endsAt: '', searchConditions: '' });
  const [investigationSaving, setInvestigationSaving] = useState(false);

  const load = async () => setInvestigations(await fetch(`${API}/investigations`).then(r => r.json()));
  useEffect(() => { void load(); }, []);
  const loadSelectedData = async (investigation: Investigation) => {
    const [zoneResponse, trackResponse, referencePointResponse] = await Promise.all([
      fetch(`${API}/investigations/${investigation.id}/zones`),
      fetch(`${API}/investigations/${investigation.id}/tracks.geojson`),
      fetch(`${API}/investigations/${investigation.id}/reference-points`),
    ]);
    const loadedZones = zoneResponse.ok ? await zoneResponse.json() : [];
    const trackCollection = trackResponse.ok ? await trackResponse.json() : { features: [] };
    const loadedReferencePoints = referencePointResponse.ok ? await referencePointResponse.json() : [];
    const loadedTracks = (trackCollection.features ?? []).filter((feature: any) => feature?.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates)).map((feature: any) => ({
      id: String(feature.id),
      callsign: feature.properties?.callsign,
      sourceFile: feature.properties?.sourceFile,
      geometry: feature.geometry,
    })) as Track[];
    setZones(loadedZones.map((zone: Zone) => {
      const geometryType = zone.geometry?.type ?? (zone.geometry?.coordinates?.length === 2 ? 'LineString' : 'Polygon');
      return { ...zone, geometry: { ...zone.geometry, type: geometryType }, ...(geometryType === 'LineString' ? { lengthKm: zone.areaKm2 ?? 0 } : {}) };
    }));
    setZoneDrafts(Object.fromEntries(loadedZones.map((zone: Zone) => [zone.id, { name: zone.name, searched: zone.searched, searchedAt: zone.searchedAt ?? null, points: zone.points, showName: zone.showName, showArea: zone.showArea, poa: zone.poa ?? null }])));
    setTracks(loadedTracks);
    setReferencePoints(loadedReferencePoints);
    setVisibleTracks(Object.fromEntries(loadedTracks.map(track => [track.id, true])));
  };
  useEffect(() => { setHiddenZoneIds({}); setZonesExpanded(true); setZoneSearch(''); if (selected) { setInvestigationDraft({ name: selected.name, description: selected.description ?? '', startsAt: toDateTimeLocal(selected.startsAt), endsAt: toDateTimeLocal(selected.endsAt), searchConditions: selected.searchConditions ?? '' }); void loadSelectedData(selected); } else { setZones([]); setReferencePoints([]); setZoneDrafts({}); setTracks([]); setVisibleTracks({}); setEditor(null); setSelectedZoneId(null); setExpandedZoneId(null); } }, [selected]);
  useEffect(() => { document.getElementById('gpx-track-import')?.setAttribute('multiple', 'multiple'); }, [selected]);
  useEffect(() => {
    const repaintAfterFileDialog = () => {
      window.setTimeout(() => {
        const root = document.getElementById('root');
        if (root) {
          root.style.display = 'none';
          void root.offsetHeight;
          root.style.display = '';
        }
        window.dispatchEvent(new Event('resize'));
      }, 50);
    };
    window.addEventListener('focus', repaintAfterFileDialog);
    document.addEventListener('visibilitychange', repaintAfterFileDialog);
    return () => { window.removeEventListener('focus', repaintAfterFileDialog); document.removeEventListener('visibilitychange', repaintAfterFileDialog); };
  }, []);
  useEffect(() => {
    if (!selectedZoneId) return;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.zone-card.selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [selectedZoneId]);
  useEffect(() => {
    const onZoneCreated = (event: Event) => {
      const zone = (event as CustomEvent<Zone>).detail;
      if (zone) addPendingZone(zone);
    };
    const onZoneRemoved = (event: Event) => {
      const zoneId = (event as CustomEvent<string>).detail;
      if (!zoneId) return;
      setZones(current => current.filter(zone => zone.id !== zoneId));
      setZoneDrafts(current => { const next = { ...current }; delete next[zoneId]; return next; });
      setSelectedZoneId(current => current === zoneId ? null : current);
      setExpandedZoneId(current => current === zoneId ? null : current);
    };
    window.addEventListener('efp:zone-created', onZoneCreated);
    window.addEventListener('efp:zone-removed', onZoneRemoved);
    return () => { window.removeEventListener('efp:zone-created', onZoneCreated); window.removeEventListener('efp:zone-removed', onZoneRemoved); };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); editor?.undo(); }
      if (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) { event.preventDefault(); editor?.redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor?.canUndo()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editor]);

  const createInvestigation = async () => {
    setError('');
    const response = await fetch(`${API}/investigations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: null }) });
    if (!response.ok) return setError(await response.text());
    const created = await response.json() as Investigation;
    setName(''); await load(); setSelected(created);
  };
  const saveInvestigation = async () => {
    if (!selected || !investigationDraft.name.trim()) return setError('Insatsens namn måste anges.');
    if (investigationDraft.startsAt && investigationDraft.endsAt && investigationDraft.endsAt < investigationDraft.startsAt) return setError('Sluttiden måste vara efter starttiden.');
    setInvestigationSaving(true); setError('');
    try {
      const response = await fetch(`${API}/investigations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: investigationDraft.name.trim(), description: investigationDraft.description || null, startsAt: investigationDraft.startsAt ? new Date(investigationDraft.startsAt).toISOString() : null, endsAt: investigationDraft.endsAt ? new Date(investigationDraft.endsAt).toISOString() : null, searchConditions: investigationDraft.searchConditions || null }) });
      if (!response.ok) throw new Error((await response.text()) || 'Kunde inte spara insatsens inställningar.');
      const updated = await response.json() as Investigation;
      setSelected(updated); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Kunde inte spara insatsens inställningar.'); }
    finally { setInvestigationSaving(false); }
  };
  const changeInvestigationStatus = async (status: string) => {
    if (!selected) return;
    if (status === 'Archived' && !window.confirm(`Är du säker på att du vill arkivera sökinsatsen "${selected.name}"?`)) return;
    setError('');
    const response = await fetch(`${API}/investigations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) { setError((await response.text()) || 'Kunde inte ändra insatsens status.'); return; }
    const updated = await response.json() as Investigation;
    setSelected(updated); await load();
  };
  const saveReferencePoint = async (type: ReferencePoint['type'], latitude: number, longitude: number) => {
    if (!selected) return;
    const labels: Record<ReferencePoint['type'], string> = { Pls: 'PLS', Lkp: 'LKP', Ipp: 'IPP' };
    const label = window.prompt(`Namn på ${labels[type]}`, labels[type]);
    if (label === null || !label.trim()) return;
    const response = await fetch(`${API}/investigations/${selected.id}/reference-points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: label.trim(), latitude, longitude }) });
    if (!response.ok) { setError((await response.text()) || `Kunde inte spara ${labels[type]}.`); return; }
    const created = await response.json() as ReferencePoint;
    setReferencePoints(current => [...current, created]);
  };
  const saveLatestZone = async () => {
    if (!selected) return setError('Välj en sökinsats först.');
    const coordinates = editor?.latestPolygon();
    if (!coordinates) return setError('Rita eller välj en polygon/fyrkant först.');
    const response = await fetch(`${API}/investigations/${selected.id}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Zon ${zones.length + 1}`, status: 'NotStarted', searchMethod: 'Patrol', priority: zones.length + 1, geometry: { coordinates } }) });
    if (!response.ok) return setError(await response.text());
    setZones(await fetch(`${API}/investigations/${selected.id}/zones`).then(r => r.json()));
  };
  const importGpx = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0 || !selected) return;
    setError('');
    try {
      for (const file of files) {
        const form = new FormData(); form.append('file', file); form.append('callsign', 'GPX-import');
        const response = await fetch(`${API}/investigations/${selected.id}/tracks/import?callsign=GPX-import`, { method: 'POST', body: form });
        if (!response.ok) throw new Error(`${file.name}: ${(await response.text()) || `GPX-importen misslyckades (HTTP ${response.status}).`}`);
      }
      await loadSelectedData(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GPX-importen misslyckades. Kontrollera att filerna innehåller minst två spårpunkter.');
    }
  };
  const importZoneGpx = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    setError('');
    const form = new FormData(); form.append('file', file);
    const response = await fetch(`${API}/investigations/${selected.id}/zones/import`, { method: 'POST', body: form });
    if (!response.ok) { setError(await response.text()); return; }
    await loadSelectedData(selected);
  };
  const saveMapChanges = async () => {
    if (!editor) return;
    setError('');
    try { await editor.save(); await loadSelectedData(selected!); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Kunde inte spara kartändringarna.'); }
  };
  const discardMapChanges = async () => {
    if (!selected) return;
    editor?.discard();
    await loadSelectedData(selected);
    setActiveTool('none');
    setSelectedZoneId(null);
    setExpandedZoneId(null);
    setError('');
  };
  const updateZoneDraft = (zoneId: string, details: Partial<ZoneDetails>) => {
    setZoneDrafts(current => ({ ...current, [zoneId]: { ...current[zoneId], ...details } }));
    editor?.updateZoneDetails(zoneId, { ...zoneDrafts[zoneId], ...details });
  };
  const deleteZone = async (zone: Zone) => {
    if (!selected || !window.confirm(`Är du säker på att du vill radera zonen "${zone.name}"?`)) return;
    setError('');
    if (zone.id.startsWith('draft-')) {
      editor?.removeZone(zone.id);
      setZones(current => current.filter(item => item.id !== zone.id));
      setZoneDrafts(current => { const next = { ...current }; delete next[zone.id]; return next; });
      if (selectedZoneId === zone.id) setSelectedZoneId(null);
      if (expandedZoneId === zone.id) setExpandedZoneId(null);
      return;
    }
    const response = await fetch(`${API}/investigations/${selected.id}/zones/${zone.id}`, { method: 'DELETE' });
    if (!response.ok) { setError((await response.text()) || `Kunde inte radera zonen (HTTP ${response.status}).`); return; }
    if (selectedZoneId === zone.id) setSelectedZoneId(null);
    if (expandedZoneId === zone.id) setExpandedZoneId(null);
    await loadSelectedData(selected);
  };
  const toggleZoneVisibility = (zoneId: string) => setHiddenZoneIds(current => ({ ...current, [zoneId]: !current[zoneId] }));
  const selectZone = (zoneId: string) => { setSelectedZoneId(zoneId); setExpandedZoneId(zoneId); };
  const addPendingZone = (zone: Zone) => {
    setZones(current => current.some(item => item.id === zone.id)
      ? current.map(item => item.id === zone.id ? zone : item)
      : [...current, zone]);
    setZoneDrafts(current => ({ ...current, [zone.id]: { name: zone.name, searched: zone.searched, searchedAt: zone.searchedAt ?? null, points: zone.points, showName: zone.showName, showArea: zone.showArea, poa: zone.poa ?? null } }));
    setSelectedZoneId(zone.id);
    setExpandedZoneId(zone.id);
  };

  const chooseTool = (tool: ActiveTool, action: () => void) => { if (activeTool === tool) { setActiveTool('none'); editor?.stop(); return; } setActiveTool(tool); action(); };
  const mapLayers: Record<MapType, { url: string; attribution: string }> = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
    topographic: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  };
  const selectedMapLayer = mapLayers[mapType];
  const matchingZones = filterZonesByName(zones, zoneSearch, Object.fromEntries(Object.entries(zoneDrafts).map(([id, draft]) => [id, draft.name])));
  const nextZoneName = () => {
    const names = new Set(zones.map(zone => (zoneDrafts[zone.id]?.name ?? zone.name).trim().toLocaleLowerCase()));
    let number = 1;
    while (names.has(`zon ${number}`)) number += 1;
    return `Zon ${number}`;
  };
  const updateTrackPod = async (track: Track, value: string) => {
    if (!selected) return;
    const pod = value === '' ? null : Number(value);
    if (pod !== null && (!Number.isFinite(pod) || pod < 0 || pod > 100)) return setError('POD måste vara mellan 0 och 100.');
    const response = await fetch(`${API}/investigations/${selected.id}/tracks/${track.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pod }) });
    if (!response.ok) return setError((await response.text()) || 'Kunde inte spara POD.');
    setTracks(current => current.map(item => item.id === track.id ? { ...item, pod } : item));
  };

  if (!selected) return <main className="selection-screen">
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    {error && <p className="error">{error}</p>}
    <section className="investigation-picker"><h2>Välj sökinsats</h2><p>Välj en befintlig sökinsats eller skapa en ny för att öppna kartan och dess underlag.</p><div className="investigation-create"><input value={name} onChange={event => setName(event.target.value)} placeholder="Namn på ny sökinsats" /><button onClick={() => void createInvestigation()}>Skapa sökinsats</button></div><div className="investigation-list">{investigations.map(item => <button onClick={() => setSelected(item)} key={item.id}>{item.name}<small>{item.status}</small></button>)}</div></section>
  </main>;

  return <main className="app-shell">
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    {error && <p className="error">{error}</p>}
    <InvestigationInlineSettingsV2 investigation={selected} draft={investigationDraft} saving={investigationSaving} onDraftChange={setInvestigationDraft} onSave={() => void saveInvestigation()} onStatusChange={status => void changeInvestigationStatus(status)} />
    <div className="layout">
      <aside className="investigation-sidebar">
        <button className="back-button" onClick={() => { if (!editor?.canUndo() || window.confirm('Du har osparade ändringar. Vill du lämna sidan utan att spara?')) setSelected(null); }}>← Byt sökinsats</button>
        <section className="sidebar-section"><h3>Kartändringar</h3><button onClick={() => void saveMapChanges()}>Spara ändringar</button><button className="discard-button" onClick={() => void discardMapChanges()}>Släng ändringar</button></section>
        <section className="sidebar-section zones-section">
          <button className="zones-section-toggle" onClick={() => setZonesExpanded(current => !current)}><h3>Zoner</h3><span aria-hidden="true">{zonesExpanded ? '▴' : '▾'}</span></button>
          {zonesExpanded && <><input className="zone-search" type="search" value={zoneSearch} onChange={event => setZoneSearch(event.target.value)} placeholder="Sök zon-namn" aria-label="Sök zon-namn" />
            {zones.length === 0 ? <p className="muted">Inga zoner i sökinsatsen.</p> : matchingZones.length === 0 ? <p className="muted">Inga zoner matchar sökningen.</p> : matchingZones.map(zone => {
              const draft = zoneDrafts[zone.id] ?? { name: zone.name, searched: zone.searched, searchedAt: zone.searchedAt ?? null, points: zone.points, showName: zone.showName, showArea: zone.showArea, poa: zone.poa ?? null };
              const expanded = expandedZoneId === zone.id; const hidden = hiddenZoneIds[zone.id] === true;
              return <article className={`zone-card ${selectedZoneId === zone.id ? 'selected' : ''}`} key={zone.id}><button className="zone-card-header" onClick={() => { setSelectedZoneId(zone.id); setExpandedZoneId(expanded ? null : zone.id); }}><span>{draft.name || 'Namnlös zon'}</span><span className="zone-card-status">{hidden ? 'Dold' : draft.searched ? 'Sökt' : 'Ej sökt'} · {draft.points} p</span><span aria-hidden="true">{expanded ? '▴' : '▾'}</span></button>
                {expanded && <div className="zone-card-body" onClick={event => event.stopPropagation()}><label>Namn<input value={draft.name} onChange={event => updateZoneDraft(zone.id, { name: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.searched} onChange={event => updateZoneDraft(zone.id, { searched: event.target.checked, searchedAt: event.target.checked ? draft.searchedAt ?? new Date().toISOString() : null })} /> Sökt</label><label>Sökt när<input type="datetime-local" disabled={!draft.searched} value={draft.searchedAt ? draft.searchedAt.slice(0, 16) : ''} onChange={event => updateZoneDraft(zone.id, { searchedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label>POA (%)<input type="number" min="0" max="100" step="0.1" value={draft.poa ?? ''} onChange={event => updateZoneDraft(zone.id, { poa: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Poäng<input type="number" min="0" value={draft.points} onChange={event => updateZoneDraft(zone.id, { points: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.showName} onChange={event => updateZoneDraft(zone.id, { showName: event.target.checked })} /> Visa namn i kartan</label><label className="checkbox-label"><input type="checkbox" checked={draft.showArea} onChange={event => updateZoneDraft(zone.id, { showArea: event.target.checked })} /> Visa storlek i km²</label><button className="simplify-button" onClick={() => editor?.simplifyZone(zone.id, simplifyTolerance)}>Förenkla polygon</button><div className="zone-card-actions"><button onClick={() => toggleZoneVisibility(zone.id)}>{hidden ? 'Visa zon i kartan' : 'Dölj zon i kartan'}</button><button className="danger-button" onClick={() => void deleteZone(zone)}>Radera zon</button></div></div>}</article>;
            })}</>}
        </section>
        <details className="sidebar-section export-section"><summary>Exportera</summary><div className="export-links"><strong>Zoner</strong>{exportFormats.map(format => <a key={`zone-${format.label}`} href={format.zones(API, selected.id)}>{format.label}</a>)}<strong>Spår</strong>{exportFormats.map(format => <a key={`track-${format.label}`} href={format.tracks(API, selected.id)}>{format.label}</a>)}</div></details>
        <section className="sidebar-section"><h3>Importera zoner från GPX</h3><input id="gpx-zone-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importZoneGpx(event)} /><label className="file-button" htmlFor="gpx-zone-import">Välj zon-GPX-fil</label></section>
        <section className="sidebar-section"><h3>Importera spår från GPX</h3><input id="gpx-track-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importGpx(event)} /><label className="file-button" htmlFor="gpx-track-import">Välj spår-GPX-fil</label>{tracks.length > 0 && <div className="track-list">{tracks.map(track => <label key={track.id}><input type="checkbox" checked={visibleTracks[track.id] ?? true} onChange={event => setVisibleTracks(current => ({ ...current, [track.id]: event.target.checked }))} /><span>{track.sourceFile ?? track.callsign ?? 'GPX-import'}</span><input aria-label={`POD för ${track.sourceFile ?? track.callsign ?? 'spår'}`} type="number" min="0" max="100" step="0.1" value={track.pod ?? ''} placeholder="POD %" onChange={event => void updateTrackPod(track, event.target.value)} /></label>)}</div>}</section>
      </aside>
      <div className={`map map-cursor-${activeTool.toLowerCase()}`}><MapContainer key={selected.id} center={center} zoom={10} scrollWheelZoom><TileLayer attribution={selectedMapLayer.attribution} url={selectedMapLayer.url} /><TrackLayers tracks={tracks} visibleTracks={visibleTracks} /><MapEditor investigationId={selected.id} color={color} strokeStyle={strokeStyle} zones={zones} nextZoneName={nextZoneName} activeTool={activeTool} onToolChange={setActiveTool} selectedZoneId={selectedZoneId} hiddenZoneIds={hiddenZoneIds} onZoneSelect={zoneId => { setSelectedZoneId(zoneId); setExpandedZoneId(zoneId); }} onReady={api => setEditor({ ...api })} /></MapContainer><div className="map-type-control"><label htmlFor="map-type">Karttyp</label><select id="map-type" value={mapType} onChange={event => setMapType(event.target.value as MapType)}><option value="osm">Standard</option><option value="topographic">Topografisk</option><option value="satellite">Satellit</option></select></div><div className="map-toolbar" aria-label="Ritverktyg"><button className={activeTool === 'Polygon' ? 'active' : ''} onClick={() => chooseTool('Polygon', () => editor?.draw('Polygon'))}>⬡ Polygon</button><button className={activeTool === 'Rectangle' ? 'active' : ''} onClick={() => chooseTool('Rectangle', () => editor?.draw('Rectangle'))}>▣ Fyrkant</button><button className={activeTool === 'Circle' ? 'active' : ''} onClick={() => chooseTool('Circle', () => editor?.draw('Circle'))}>◯ Cirkel</button><button className={activeTool === 'Line' ? 'active' : ''} onClick={() => chooseTool('Line', () => editor?.draw('Line'))}>╱ Sträcka</button><button className={activeTool === 'Text' ? 'active' : ''} onClick={() => chooseTool('Text', () => editor?.text())}>T Text</button><label>Färg <input className="color-input" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Linje <select value={strokeStyle} onChange={event => setStrokeStyle(event.target.value as StrokeStyle)}><option value="solid">Heldragen</option><option value="dash">Sträckad</option><option value="dot">Punktad</option><option value="dashdot">Sträck-punkt</option></select></label><button className={activeTool === 'Edit' ? 'active' : ''} onClick={() => chooseTool('Edit', () => editor?.edit())}>✎ Redigera</button><button className={activeTool === 'Drag' ? 'active' : ''} onClick={() => chooseTool('Drag', () => editor?.drag())}>✥ Flytta</button><button className={activeTool === 'Remove' ? 'active' : ''} onClick={() => chooseTool('Remove', () => editor?.remove())}>⌫ Ta bort</button><button disabled={!editor?.canUndo()} onClick={() => editor?.undo()}>↶ Ångra</button><button disabled={!editor?.canRedo()} onClick={() => editor?.redo()}>↷ Gör om</button></div></div>
    </div>
  </main>;
}

type InvestigationDraft = { name: string; description: string; startsAt: string; endsAt: string; searchConditions: string };

function InvestigationInlineSettingsV2({ investigation, draft, saving, onDraftChange, onSave, onStatusChange }: { investigation: Investigation; draft: InvestigationDraft; saving: boolean; onDraftChange: React.Dispatch<React.SetStateAction<InvestigationDraft>>; onSave: () => void; onStatusChange: (status: string) => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState(draft);
  useEffect(() => { setTarget(document.querySelector<HTMLElement>('.investigation-sidebar')); }, []);
  const beginEditing = () => { setOriginal(draft); setEditing(true); };
  const cancel = () => { onDraftChange(original); setEditing(false); };
  const save = () => { setEditing(false); onSave(); };
  const update = (changes: Partial<InvestigationDraft>) => onDraftChange(current => ({ ...current, ...changes }));
  const viewField = (label: string, value: string, className = '') => <div className={`stacked-setting ${className}`}><span className="stacked-setting-label">{label}</span><span className="stacked-setting-value">{value || 'Inte angivet'}</span></div>;
  if (!target) return null;
  return createPortal(<><section className="sidebar-section investigation-settings-v2"><h3>Insats <InvestigationEditButton editing={editing} onClick={beginEditing} /></h3>{editing ? <><label className="stacked-setting">Namn<input autoFocus value={draft.name} onChange={event => update({ name: event.target.value })} /></label><label className="stacked-setting">Status<select value={investigation.status} onChange={event => onStatusChange(event.target.value)}><option value="Planned">Planerad</option><option value="Active">Aktiv</option><option value="Paused">Pausad</option><option value="Closed">Avslutad</option><option value="Archived">Arkiverad</option></select></label><label className="stacked-setting">Beskrivning<textarea value={draft.description} onChange={event => update({ description: event.target.value })} rows={3} /></label><label className="stacked-setting">Starttid<input type="datetime-local" value={draft.startsAt} onChange={event => update({ startsAt: event.target.value })} /></label><label className="stacked-setting">Sluttid<input type="datetime-local" value={draft.endsAt} onChange={event => update({ endsAt: event.target.value })} /></label><label className="stacked-setting">Sökförutsättningar<textarea value={draft.searchConditions} onChange={event => update({ searchConditions: event.target.value })} rows={4} /></label><div className="inline-edit-actions"><button type="button" onClick={save} disabled={saving}>Spara</button><button type="button" className="cancel-inline-edit" onClick={cancel}>Avbryt</button></div></> : <>{viewField('Namn', draft.name, 'investigation-name')}{viewField('Status', investigationStatusLabel(investigation.status))}{viewField('Beskrivning', draft.description, 'investigation-description')}{viewField('Starttid', formatDateTime(draft.startsAt))}{viewField('Sluttid', formatDateTime(draft.endsAt))}{viewField('Sökförutsättningar', draft.searchConditions, 'investigation-description')}</>}</section>{investigation.status !== 'Archived' && <button className="discard-button archive-investigation" onClick={() => onStatusChange('Archived')} disabled={saving}>Arkivera sökinsats</button>}</>, target);
}

function InvestigationInlineSettings({ investigation, draft, saving, onDraftChange, onSave, onStatusChange }: { investigation: Investigation; draft: InvestigationDraft; saving: boolean; onDraftChange: React.Dispatch<React.SetStateAction<InvestigationDraft>>; onSave: () => void; onStatusChange: (status: string) => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [original, setOriginal] = useState(draft);
  useEffect(() => { setTarget(document.querySelector<HTMLElement>('.investigation-sidebar')); }, []);
  useEffect(() => { if (!editing) setOriginal(draft); }, [draft, editing]);
  if (!target) return null;
  const edit = (field: string) => { setOriginal(draft); setEditing(field); };
  const cancel = () => { onDraftChange(original); setEditing(null); };
  const save = () => { setEditing(null); onSave(); };
  const row = (field: keyof InvestigationDraft, label: string, value: string, input: React.ReactNode) => <div className="inline-setting"><span className="inline-setting-label">{label}</span>{editing === field ? <div className="inline-setting-editor">{input}<button type="button" title="Spara" aria-label={`Spara ${label}`} onClick={save}>✓</button><button type="button" title="Avbryt" aria-label={`Avbryt ${label}`} onClick={cancel}>×</button></div> : <><span className="inline-setting-value">{value || 'Inte angivet'}</span><button type="button" className="edit-icon" title={`Redigera ${label}`} aria-label={`Redigera ${label}`} onClick={() => edit(field)}>✎</button></>}</div>;
  const changeStatus = (status: string) => { setEditing(null); onStatusChange(status); };
  return createPortal(<><section className="sidebar-section investigation-settings"><h3>Insats</h3>{row('name', 'Namn', draft.name, <input autoFocus value={draft.name} onChange={event => onDraftChange(current => ({ ...current, name: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') save(); }} />)}<div className="inline-setting"><span className="inline-setting-label">Status</span>{editing === 'status' ? <div className="inline-setting-editor"><select autoFocus value={investigation.status} onChange={event => changeStatus(event.target.value)}><option value="Planned">Planerad</option><option value="Active">Aktiv</option><option value="Paused">Pausad</option><option value="Closed">Avslutad</option><option value="Archived">Arkiverad</option></select><button type="button" title="Avbryt" aria-label="Avbryt statusredigering" onClick={() => setEditing(null)}>×</button></div> : <><span className="inline-setting-value">{investigationStatusLabel(investigation.status)}</span><button type="button" className="edit-icon" title="Redigera status" aria-label="Redigera status" onClick={() => edit('status')}>✎</button></>}</div>{row('description', 'Beskrivning', draft.description, <textarea autoFocus value={draft.description} onChange={event => onDraftChange(current => ({ ...current, description: event.target.value }))} rows={3} />)}{row('startsAt', 'Starttid', formatDateTime(draft.startsAt), <input autoFocus type="datetime-local" value={draft.startsAt} onChange={event => onDraftChange(current => ({ ...current, startsAt: event.target.value }))} />)}{row('endsAt', 'Sluttid', formatDateTime(draft.endsAt), <input autoFocus type="datetime-local" value={draft.endsAt} onChange={event => onDraftChange(current => ({ ...current, endsAt: event.target.value }))} />)}<button className="inline-save-all" onClick={onSave} disabled={saving}>{saving ? 'Sparar…' : 'Spara ändringar'}</button></section>{investigation.status !== 'Archived' && <button className="discard-button archive-investigation" onClick={() => onStatusChange('Archived')} disabled={saving}>Arkivera sökinsats</button>}</>, target);
}

function InvestigationSettings({ investigation, draft, saving, onDraftChange, onSave, onStatusChange }: { investigation: Investigation; draft: InvestigationDraft; saving: boolean; onDraftChange: React.Dispatch<React.SetStateAction<InvestigationDraft>>; onSave: () => void; onStatusChange: (status: string) => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [original, setOriginal] = useState(draft);
  useEffect(() => { setTarget(document.querySelector<HTMLElement>('.investigation-sidebar')); }, []);
  useEffect(() => { if (!editing) setOriginal(draft); }, [draft, editing]);
  if (!target) return null;
  const edit = (field: keyof InvestigationDraft) => { setOriginal(draft); setEditing(field); };
  const cancel = () => { onDraftChange(original); setEditing(null); };
  const save = () => { setEditing(null); onSave(); };
  const row = (field: keyof InvestigationDraft, label: string, value: string, input: React.ReactNode) => <div className="inline-setting"><span className="inline-setting-label">{label}</span>{editing === field ? <div className="inline-setting-editor">{input}<button type="button" title="Spara" aria-label={`Spara ${label}`} onClick={save}>✓</button><button type="button" title="Avbryt" aria-label={`Avbryt ${label}`} onClick={cancel}>×</button></div> : <><span className="inline-setting-value">{value || 'Inte angivet'}</span><button type="button" className="edit-icon" title={`Redigera ${label}`} aria-label={`Redigera ${label}`} onClick={() => edit(field)}>✎</button></>}</div>;
  return createPortal(<section className="sidebar-section investigation-settings"><h3>Insatsinställningar</h3>{row('name', 'Namn', draft.name, <input autoFocus value={draft.name} onChange={event => onDraftChange(current => ({ ...current, name: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') save(); }} />)}{row('description', 'Beskrivning', draft.description, <textarea autoFocus value={draft.description} onChange={event => onDraftChange(current => ({ ...current, description: event.target.value }))} rows={3} />)}{row('startsAt', 'Starttid', formatDateTime(draft.startsAt), <input autoFocus type="datetime-local" value={draft.startsAt} onChange={event => onDraftChange(current => ({ ...current, startsAt: event.target.value }))} />)}{row('endsAt', 'Sluttid', formatDateTime(draft.endsAt), <input autoFocus type="datetime-local" value={draft.endsAt} onChange={event => onDraftChange(current => ({ ...current, endsAt: event.target.value }))} />)}<div className="inline-setting"><span className="inline-setting-label">Status</span><span className="inline-setting-value">{investigationStatusLabel(investigation.status)}</span><button type="button" className="edit-icon" title="Redigera status" aria-label="Redigera status" onClick={() => edit('status' as keyof InvestigationDraft)}>✎</button></div>{editing === 'status' && <div className="inline-setting-editor status-editor"><select autoFocus value={investigation.status} onChange={event => onStatusChange(event.target.value)}><option value="Planned">Planerad</option><option value="Active">Aktiv</option><option value="Paused">Pausad</option><option value="Closed">Avslutad</option><option value="Archived">Arkiverad</option></select><button type="button" title="Avbryt" aria-label="Avbryt statusredigering" onClick={() => setEditing(null)}>×</button></div>}{investigation.status !== 'Archived' && <button className="discard-button archive-investigation" onClick={() => onStatusChange('Archived')} disabled={saving}>Arkivera sökinsats</button>}</section>, target);
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <main className="selection-screen"><header><h1>EFP sökledning</h1><span>Admin MVP</span></header><section className="investigation-picker"><h2>Gränssnittet kunde inte visas</h2><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>Ladda om sidan</button></section></main>;
    return this.props.children;
  }
}

function ReferencePointPlacement({ enabled, onPlace }: { enabled: boolean; onPlace: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: event => { if (enabled) onPlace(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function ReferencePointLayers({ referencePoints }: { referencePoints: ReferencePoint[] }) {
  const map = useMap();
  useEffect(() => {
    const layers = referencePoints.map(point => {
      const marker = L.marker([point.latitude, point.longitude], {
        title: `${point.type.toUpperCase()}: ${point.label}`,
        icon: L.divIcon({ className: 'efp-reference-point', html: `<span>${point.type.toUpperCase()}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
      }).addTo(map);
      marker.bindTooltip(`${point.type.toUpperCase()}: ${escapeHtml(point.label)}`);
      return marker;
    });
    return () => { layers.forEach(layer => layer.remove()); };
  }, [map, referencePoints]);
  return null;
}

function TrackLayers({ tracks, visibleTracks }: { tracks: Track[]; visibleTracks: Record<string, boolean> }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    tracks.filter(track => visibleTracks[track.id] !== false).forEach(track => {
      const geometry = { ...track.geometry, coordinates: limitTrackCoordinates(track.geometry.coordinates) };
      L.geoJSON({ type: 'Feature', properties: {}, geometry } as GeoJSON.Feature, { style: { color: '#7c3aed', weight: 4, opacity: 0.85 } }).addTo(group);
    });
    return () => { group.remove(); };
  }, [map, tracks, visibleTracks]);
  return null;
}

function limitTrackCoordinates(coordinates: number[][], maximum = 5000): number[][] {
  if (coordinates.length <= maximum) return coordinates;
  const step = (coordinates.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => coordinates[Math.round(index * step)]);
}

function MapEditor({ investigationId, color, strokeStyle, zones, nextZoneName, activeTool, onToolChange, selectedZoneId, hiddenZoneIds, onZoneSelect, onReady }: { investigationId: string; color: string; strokeStyle: StrokeStyle; zones: Zone[]; nextZoneName: () => string; activeTool: ActiveTool; onToolChange: (tool: ActiveTool) => void; selectedZoneId: string | null; hiddenZoneIds: Record<string, boolean>; onZoneSelect: (zoneId: string) => void; onReady: (api: EditorApi) => void }) {
  const map = useMap();
  const persistedZoneKey = JSON.stringify(zones.filter(zone => !zone.id.startsWith('draft-')));
  const history = useRef<DrawingSnapshot[][]>([[]]);
  const historyIndex = useRef(0);
  const restoring = useRef(false);
  const textLayers = useRef<L.Marker[]>([]);
  const serverZoneLayers = useRef<any[]>([]);
  const initialServerZoneIds = useRef<string[]>([]);
  const serverBaselineInitialized = useRef(false);
  const textRemovalMode = useRef(false);
  const editSelectionMode = useRef(false);
  const drawingMode = useRef(false);
  const editingLayer = useRef<any | null>(null);
  const splitSelectionMode = useRef(false);
  const splitTarget = useRef<any | null>(null);
  const mergeSelectionMode = useRef(false);
  const mergeFirst = useRef<any | null>(null);
  const [textMode, setTextMode] = useState(false);
  const [referencePointMode, setReferencePointMode] = useState<ReferencePoint['type'] | null>(null);
  const [referencePoints, setReferencePoints] = useState<ReferencePoint[]>([]);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const settings = useRef({ color, strokeStyle });
  const nextZoneNameRef = useRef(nextZoneName);
  settings.current = { color, strokeStyle };
  nextZoneNameRef.current = nextZoneName;
  useEffect(() => { setToolbarTarget(document.querySelector<HTMLElement>('.map-toolbar')); }, []);
  useEffect(() => { void fetch(`${API}/investigations/${investigationId}/reference-points`).then(response => response.ok ? response.json() : []).then(setReferencePoints); }, [investigationId]);
  const geomanMap = map as L.Map & { pm?: any };
  const getLayers = () => geomanMap.pm?.getGeomanLayers?.() ?? [];
  const styleFor = (layer: any) => ({ color: layer.options?.color ?? '#2563eb', weight: layer.options?.weight ?? 4, dashArray: layer.options?.dashArray });
  const snapshot = (): DrawingSnapshot[] => {
    const shapes = getLayers().map((layer: any) => {
      const shape = layer instanceof L.Circle ? 'Circle' : layer.pm?.getShape?.() ?? layer.toGeoJSON().geometry.type;
      if (shape === 'Circle') return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, radius: layer.getRadius(), zoneId: layer.__zoneId, zone: layer.__zone, style: styleFor(layer) };
      return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, zoneId: layer.__zoneId, zone: layer.__zone, style: styleFor(layer) };
    });
    const texts = textLayers.current.map(layer => { const position = layer.getLatLng(); return { kind: 'text' as const, text: layer.options.title ?? '', lat: position.lat, lng: position.lng }; });
    return [...shapes, ...texts];
  };
  const saveHistory = () => {
    if (restoring.current) return;
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(history.current[historyIndex.current])) return;
    history.current = [...history.current.slice(0, historyIndex.current + 1), next]; historyIndex.current += 1; onReady(api);
  };
  const addTextLayer = (text: string, lat: number, lng: number) => {
    const marker = L.marker([lat, lng], { draggable: true, title: text, icon: L.divIcon({ className: 'efp-map-text', html: escapeHtml(text) }) }).addTo(map);
    marker.on('click', () => { if (textRemovalMode.current) { marker.remove(); textLayers.current = textLayers.current.filter(item => item !== marker); saveHistory(); } });
    marker.on('dblclick', () => { const updated = window.prompt('Ändra text', marker.options.title ?? text); if (updated?.trim()) { marker.options.title = updated.trim(); marker.setIcon(L.divIcon({ className: 'efp-map-text', html: escapeHtml(updated.trim()) })); saveHistory(); } });
    marker.on('dragend', saveHistory); textLayers.current.push(marker); saveHistory();
  };
  const restore = (items: DrawingSnapshot[]) => {
    restoring.current = true; getLayers().forEach((layer: any) => layer.remove()); textLayers.current.forEach(layer => layer.remove()); textLayers.current = [];
    const restoredDraftZones: Zone[] = [];
    items.forEach(item => {
      if (item.kind === 'text' && item.text && item.lat !== undefined && item.lng !== undefined) { addTextLayer(item.text, item.lat, item.lng); return; }
      if (!item.geometry) return;
      const geometry = item.geometry as any; const coordinates = geometry.coordinates; const options = { ...item.style, fillColor: item.style?.color, fillOpacity: 0.15 }; let layer: any;
      if (item.shape === 'Circle') layer = L.circle([coordinates[1], coordinates[0]], { ...options, radius: item.radius ?? 20 }).addTo(map);
      else if (item.shape === 'Rectangle') layer = L.rectangle(toLatLngs(coordinates[0]), options).addTo(map);
      else if (item.shape === 'Line' || geometry.type === 'LineString') layer = L.polyline(toLatLngs(coordinates), options).addTo(map);
      else layer = L.polygon(toLatLngs(coordinates[0]), options).addTo(map);
      if (item.zoneId) layer.__zoneId = item.zoneId;
      if (item.zone) layer.__zone = item.zone;
      geomanMap.pm?.reInitLayer?.(layer);
      if (item.zone) {
        configureZoneLayer(layer);
        if (item.zone.id?.startsWith('draft-')) restoredDraftZones.push(item.zone as Zone);
      }
    });
    restoring.current = false;
    restoredDraftZones.forEach(zone => window.dispatchEvent(new CustomEvent<Zone>('efp:zone-created', { detail: zone })));
  };
  const undo = () => { if (historyIndex.current === 0) return; historyIndex.current -= 1; restore(history.current[historyIndex.current]); onReady(api); };
  const redo = () => { if (historyIndex.current >= history.current.length - 1) return; historyIndex.current += 1; restore(history.current[historyIndex.current]); onReady(api); };
  const latestPolygon = () => {
    const layers = getLayers().slice().reverse();
    const layer = layers.find((item: any) => ['Polygon', 'Rectangle'].includes(item.pm?.getShape?.() ?? item.toGeoJSON().geometry.type));
    if (!layer) return null;
    const geometry = layer.toGeoJSON().geometry as any;
    return geometry.coordinates?.[0] ?? null;
  };
  const circleToPolygonCoordinates = (layer: any): number[][] => {
    const center = layer.getLatLng();
    const radius = layer.getRadius();
    const earthRadiusMeters = 6378137;
    const latitudeOffset = (radius / earthRadiusMeters) * (180 / Math.PI);
    const longitudeOffset = latitudeOffset / Math.max(Math.cos(center.lat * Math.PI / 180), 0.000001);
    return Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return [center.lng + Math.cos(angle) * longitudeOffset, center.lat + Math.sin(angle) * latitudeOffset];
    });
  };
  const getPolygonCoordinates = (layer: any): number[][] | null => {
    const shape = layer.pm?.getShape?.() ?? layer.toGeoJSON().geometry.type;
    if (shape === 'Circle') return circleToPolygonCoordinates(layer);
    if (!['Polygon', 'Rectangle'].includes(shape)) return null;
    return (layer.toGeoJSON().geometry as any).coordinates?.[0] ?? null;
  };
  const getZoneCoordinates = (layer: any): number[][] | null => {
    const polygon = getPolygonCoordinates(layer);
    if (polygon) return polygon;
    const geometry = layer.toGeoJSON().geometry as any;
    return geometry.type === 'LineString' ? geometry.coordinates : null;
  };
  const calculateLineLengthKm = (coordinates: number[][]) => coordinates.slice(1).reduce((total, coordinate, index) => {
    const previous = coordinates[index];
    const latitude = ((previous[1] + coordinate[1]) / 2) * Math.PI / 180;
    const dx = (coordinate[0] - previous[0]) * 111.32 * Math.cos(latitude);
    const dy = (coordinate[1] - previous[1]) * 111.32;
    return total + Math.hypot(dx, dy);
  }, 0);
  const updateZoneLabel = (layer: any) => {
    const zone = layer.__zone as Zone | undefined;
    if (!zone) return;
    const labels = [];
    if (zone.showName) labels.push(escapeHtml(zone.name));
    if (zone.geometry.type === 'LineString' && zone.showArea) labels.push(`${(zone.lengthKm ?? 0).toFixed(3)} km`);
    else if (zone.showArea) labels.push(`${(zone.areaKm2 ?? 0).toFixed(3)} km²`);
    if (labels.length === 0) layer.unbindTooltip?.();
    else layer.bindTooltip(labels.join('<br>'), { permanent: true, direction: 'center', className: 'zone-label' }).openTooltip();
  };
  const configureZoneLayer = (layer: any) => {
    layer.on('pm:edit pm:dragend', saveHistory);
    layer.on('pm:remove', saveHistory);
    layer.on('click', (event: any) => {
      if (drawingMode.current) {
        event.originalEvent?.stopPropagation?.();
        return;
      }
      if (layer.__zoneId && hiddenZoneIds[layer.__zoneId]) return;
      if (mergeSelectionMode.current) {
        event.originalEvent?.stopPropagation?.();
        if (!mergeFirst.current) {
          mergeFirst.current = layer;
          layer.setStyle({ color: '#f59e0b', weight: 6 });
          const zoneId = layer.__zoneId ?? layer.__zone?.id;
          if (zoneId) onZoneSelect(zoneId);
          return;
        }
        if (mergeFirst.current === layer) return;
        mergeZoneLayers(mergeFirst.current, layer);
        return;
      }
      if (splitSelectionMode.current) {
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        splitSelectionMode.current = false;
        splitTarget.current = layer;
        const zoneId = layer.__zoneId ?? layer.__zone?.id;
        if (zoneId) onZoneSelect(zoneId);
        layer.setStyle({ color: '#f59e0b', weight: 6 });
        // Starta inte Geoman på samma klick som väljer zonen. Annars blir
        // zonklicket samtidigt första punkten på delningslinjen.
        window.setTimeout(() => {
          if (!splitTarget.current) return;
          geomanMap.pm?.enableDraw?.('Line', { pathOptions: { color: '#f59e0b', weight: 5, dashArray: '10 6' } });
        }, 0);
        return;
      }
      if (editSelectionMode.current) {
        event.originalEvent?.stopPropagation?.();
        if (editingLayer.current && editingLayer.current !== layer) editingLayer.current.pm?.disable?.();
        editingLayer.current = layer;
        layer.pm?.enable?.({ allowSelfIntersection: false });
        return;
      }
      const zoneId = layer.__zoneId ?? layer.__zone?.id;
      if (zoneId) onZoneSelect(zoneId);
    });
    updateZoneLabel(layer);
  };
  const updateZoneDetails = (zoneId: string, details: ZoneDetails) => {
    const layer = getLayers().find((candidate: any) => candidate.__zoneId === zoneId || candidate.__zone?.id === zoneId);
    if (!layer) return;
    layer.__zone = { ...layer.__zone, ...details };
    updateZoneLabel(layer);
    saveHistory();
  };
  const simplifyZone = (zoneId: string, toleranceMeters: number) => {
    const layer = getLayers().find((candidate: any) => candidate.__zoneId === zoneId || candidate.__zone?.id === zoneId);
    if (!layer) return;
    const coordinates = getPolygonCoordinates(layer);
    if (!coordinates || coordinates.length < 5) return;
    const simplified = simplifyRing(coordinates, toleranceMeters);
    if (simplified.length >= coordinates.length) return;
    layer.setLatLngs([toLatLngs(simplified)]);
    layer.redraw?.();
    layer.__zone = { ...layer.__zone, areaKm2: calculateAreaKm2(simplified) };
    updateZoneLabel(layer);
    saveHistory();
  };
  const segmentsShareBoundary = (first: number[][], second: number[][]) => {
    const epsilon = 1e-8;
    const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const overlaps = (a: number[], b: number[], c: number[], d: number[]) => {
      if (Math.abs(cross(a, b, c)) > epsilon || Math.abs(cross(a, b, d)) > epsilon) return false;
      const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
      const firstMin = Math.min(a[axis], b[axis]); const firstMax = Math.max(a[axis], b[axis]);
      const secondMin = Math.min(c[axis], d[axis]); const secondMax = Math.max(c[axis], d[axis]);
      return Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) > epsilon;
    };
    for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex++) {
      for (let secondIndex = 0; secondIndex < second.length - 1; secondIndex++) {
        if (overlaps(first[firstIndex], first[firstIndex + 1], second[secondIndex], second[secondIndex + 1])) return true;
      }
    }
    return false;
  };
  const mergeZoneLayers = (firstLayer: any, secondLayer: any) => {
    const firstFeature = firstLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const secondFeature = secondLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    if (!segmentsShareBoundary(firstFeature.geometry.coordinates[0], secondFeature.geometry.coordinates[0])) {
      window.alert('Zonerna måste vara grannar och dela en gemensam kant.');
      return;
    }
    const merged = polygonUnion(featureCollection([firstFeature, secondFeature]) as any) as any;
    if (!merged || merged.geometry?.type !== 'Polygon') {
      window.alert('Zonerna kunde inte kombineras till en sammanhängande zon.');
      return;
    }
    const source = firstLayer.__zone as Zone;
    const coordinates = merged.geometry.coordinates[0] as number[][];
    const zone: Zone = { ...source, id: `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, name: `${source.name} + ${secondLayer.__zone?.name ?? 'zon'}`, areaKm2: calculateAreaKm2(coordinates), geometry: { coordinates } };
    restoring.current = true;
    firstLayer.remove(); secondLayer.remove();
    const layer: any = L.polygon(toLatLngs(coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 }).addTo(map);
    layer.__zone = zone; layer.__zoneId = undefined;
    geomanMap.pm?.reInitLayer?.(layer);
    configureZoneLayer(layer);
    restoring.current = false;
    window.dispatchEvent(new CustomEvent<string>('efp:zone-removed', { detail: firstLayer.__zone?.id }));
    window.dispatchEvent(new CustomEvent<string>('efp:zone-removed', { detail: secondLayer.__zone?.id }));
    window.dispatchEvent(new CustomEvent<Zone>('efp:zone-created', { detail: zone }));
    mergeFirst.current = null;
    saveHistory();
    onToolChange('none');
  };
  const splitZoneWithLine = (lineLayer: any, zoneLayer: any) => {
    const polygon = zoneLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const boundary = polygonToLine(polygon as any) as any;
    const splitLine = lineLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.LineString>;
    const lineCoordinates = splitLine.geometry.coordinates;
    if (lineCoordinates.length < 2) { window.alert('Delningslinjen måste innehålla minst två punkter.'); onToolChange('none'); return; }
    // Förläng linjens båda ändar så att ett streck som börjar/slutar strax
    // innanför kanten ändå kan bilda en giltig delning.
    const extend = (point: number[], neighbour: number[]) => {
      const factor = 1000;
      return [point[0] + (point[0] - neighbour[0]) * factor, point[1] + (point[1] - neighbour[1]) * factor];
    };
    splitLine.geometry.coordinates = [extend(lineCoordinates[0], lineCoordinates[1]), ...lineCoordinates, extend(lineCoordinates.at(-1)!, lineCoordinates.at(-2)!)];
    const boundaryLines = boundary.type === 'FeatureCollection' ? boundary.features : [boundary];
    const pieces = polygonize(featureCollection([...boundaryLines, splitLine] as any) as any) as any;
    const polygons = (pieces.features ?? []).filter((feature: any) => feature.geometry?.type === 'Polygon' && feature.geometry.coordinates?.[0]?.length >= 4);
    lineLayer.remove();
    zoneLayer.setStyle({ color: '#dc2626', weight: 4 });
    splitTarget.current = null;
    if (polygons.length < 2) { window.alert('Linjen måste gå genom zonen från kant till kant.'); onToolChange('none'); return; }
    restoring.current = true;
    zoneLayer.remove();
    const source = zoneLayer.__zone as Zone;
    const newZones: Zone[] = [];
    polygons.forEach((feature: any, index: number) => {
      const coordinates = feature.geometry.coordinates[0] as number[][];
      const zone: Zone = { ...source, id: `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random()}`}`, name: `${source.name} ${String.fromCharCode(65 + index)}`, priority: source.priority + index, areaKm2: calculateAreaKm2(coordinates), geometry: { coordinates } };
      const layer: any = L.polygon(toLatLngs(coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 }).addTo(map);
      layer.__zone = zone;
      layer.__zoneId = undefined;
      geomanMap.pm?.reInitLayer?.(layer);
      configureZoneLayer(layer);
      newZones.push(zone);
    });
    restoring.current = false;
    window.dispatchEvent(new CustomEvent<string>('efp:zone-removed', { detail: source.id }));
    newZones.forEach(zone => window.dispatchEvent(new CustomEvent<Zone>('efp:zone-created', { detail: zone })));
    saveHistory();
    onToolChange('none');
  };
  const saveChanges = async () => {
    const layers = getLayers();
    const draftLayers = layers.filter((layer: any) => !layer.__zoneId && layer.__zone);
    const currentZoneIds = new Set<string>();
    const requests: Promise<Response>[] = [];
    for (const layer of layers) {
      const coordinates = getZoneCoordinates(layer);
      if (!coordinates) continue;
      const geometryType = layer.__zone?.geometry?.type ?? (layer.toGeoJSON().geometry.type === 'LineString' ? 'LineString' : 'Polygon');
      const existing = layer.__zoneId ? layer.__zone as Zone | undefined : undefined;
      if (geometryType === 'Polygon' && !isValidPolygonCoordinates(coordinates)) {
        throw new Error(`Zonen "${existing?.name ?? layer.__zone?.name ?? 'Namnlös zon'}" har en ogiltig polygon. Kontrollera eller radera zonen innan du sparar.`);
      }
      if (existing) {
        currentZoneIds.add(existing.id);
        requests.push(fetch(`${API}/investigations/${investigationId}/zones/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: existing.name, status: existing.status, searchMethod: 'Patrol', priority: existing.priority, searched: existing.searched, searchedAt: existing.searchedAt, points: existing.points, showName: existing.showName, showArea: existing.showArea, poa: existing.poa ?? null, geometry: { type: geometryType, coordinates } }) }));
      } else {
        const pending = layer.__zone as Partial<Zone> | undefined;
        requests.push(fetch(`${API}/investigations/${investigationId}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: pending?.name ?? `Zon ${layers.length}`, status: pending?.status ?? 'NotStarted', searchMethod: 'Patrol', priority: pending?.priority ?? layers.length, searched: pending?.searched ?? false, searchedAt: pending?.searchedAt ?? null, points: pending?.points ?? 0, showName: pending?.showName ?? false, showArea: pending?.showArea ?? false, poa: pending?.poa ?? null, geometry: { type: geometryType, coordinates } }) }));
      }
    }
    for (const zoneId of initialServerZoneIds.current) {
      if (!currentZoneIds.has(zoneId)) requests.push(fetch(`${API}/investigations/${investigationId}/zones/${zoneId}`, { method: 'DELETE' }));
    }
    const responses = await Promise.all(requests);
    const failed = responses.find(response => !response.ok);
    if (failed) throw new Error((await failed.text()) || `Kunde inte spara en eller flera zoner (HTTP ${failed.status}).`);
    // Nya zoner har först en lokal draft-geometri. När POST/PUT lyckats
    // laddar App om serverdata, så draft-lagren måste tas bort här för att
    // inte lämna kvar en blå spökgeometri utanför zonlistan.
    restoring.current = true;
    draftLayers.forEach((layer: any) => layer.remove());
    restoring.current = false;
  };
  const discardChanges = () => { stop(); history.current = [history.current[0]]; historyIndex.current = 0; onReady(api); };
  const removeZone = (zoneId: string) => {
    const layer = getLayers().find((candidate: any) => candidate.__zone?.id === zoneId);
    if (!layer) return;
    layer.remove();
    saveHistory();
  };
  const saveReferencePoint = async (type: ReferencePoint['type'], latitude: number, longitude: number) => {
    const labels: Record<ReferencePoint['type'], string> = { Pls: 'PLS', Lkp: 'LKP', Ipp: 'IPP' };
    const label = window.prompt(`Namn på ${labels[type]}`, labels[type]);
    if (label === null || !label.trim()) return;
    const response = await fetch(`${API}/investigations/${investigationId}/reference-points`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, label: label.trim(), latitude, longitude }) });
    if (!response.ok) { window.alert((await response.text()) || `Kunde inte spara ${labels[type]}.`); return; }
    const created = await response.json() as ReferencePoint;
    setReferencePoints(current => [...current, created]);
    setReferencePointMode(null);
  };
  const stop = () => { drawingMode.current = false; textRemovalMode.current = false; editSelectionMode.current = false; splitSelectionMode.current = false; mergeSelectionMode.current = false; splitTarget.current?.setStyle?.({ color: '#dc2626', weight: 4 }); mergeFirst.current?.setStyle?.({ color: '#dc2626', weight: 4 }); splitTarget.current = null; mergeFirst.current = null; setTextMode(false); setReferencePointMode(null); geomanMap.pm?.disableDraw?.(); geomanMap.pm?.disableGlobalEditMode?.(); geomanMap.pm?.disableGlobalDragMode?.(); geomanMap.pm?.disableGlobalRemovalMode?.(); editingLayer.current?.pm?.disable?.(); editingLayer.current = null; };
  const api: EditorApi = {
    draw: mode => { stop(); drawingMode.current = true; geomanMap.pm?.enableDraw?.(mode, { pathOptions: { color: settings.current.color, weight: 4, dashArray: strokeMap[settings.current.strokeStyle], fillColor: settings.current.color, fillOpacity: 0.15 } }); },
    text: () => { stop(); setTextMode(true); }, edit: () => { stop(); editSelectionMode.current = true; }, drag: () => { stop(); geomanMap.pm?.enableGlobalDragMode?.(); }, remove: () => { stop(); textRemovalMode.current = true; geomanMap.pm?.enableGlobalRemovalMode?.(); }, removeZone, split: () => { stop(); splitSelectionMode.current = true; }, merge: () => { stop(); mergeSelectionMode.current = true; }, placeReferencePoint: type => { stop(); setReferencePointMode(type); }, stop, undo, redo, save: saveChanges, discard: discardChanges, updateZoneDetails, simplifyZone, latestPolygon, canUndo: () => historyIndex.current > 0, canRedo: () => historyIndex.current < history.current.length - 1
  };
  const createZoneLayer = (zone: Zone) => zone.geometry.type === 'LineString'
    ? L.polyline(toLatLngs(zone.geometry.coordinates), { color: '#dc2626', weight: 4 })
    : L.polygon(toLatLngs(zone.geometry.coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 });
  useEffect(() => {
    if (!geomanMap.pm) return;
    geomanMap.pm.setGlobalOptions?.({ continueDrawing: false });
    const onCreate = (event: any) => {
      if (splitTarget.current && (event.layer.pm?.getShape?.() ?? event.layer.toGeoJSON().geometry.type) === 'Line') {
        splitZoneWithLine(event.layer, splitTarget.current);
        return;
      }
      drawingMode.current = false;
      event.layer.pm?.enable?.({ allowSelfIntersection: false }); event.layer.on('pm:edit pm:dragend', saveHistory); event.layer.on('pm:remove', saveHistory); saveHistory(); onToolChange('none');
    };
    const onRemove = () => saveHistory();
    const onNewPolygon = (event: any) => {
      const shape = event.layer.pm?.getShape?.() ?? event.layer.toGeoJSON().geometry.type;
      if (!['Polygon', 'Rectangle', 'Circle', 'Line', 'LineString'].includes(shape)) return;
      const coordinates = getZoneCoordinates(event.layer);
      if (!coordinates) return;
      const id = `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const isLine = shape === 'Line' || shape === 'LineString';
      const zone: Zone = { id, name: nextZoneNameRef.current(), status: 'NotStarted', priority: zones.length + 1, searched: false, searchedAt: null, points: 0, showName: false, showArea: false, poa: null, areaKm2: isLine ? 0 : calculateAreaKm2(coordinates), lengthKm: isLine ? calculateLineLengthKm(coordinates) : undefined, geometry: { type: isLine ? 'LineString' : 'Polygon', coordinates } };
      event.layer.__zone = zone;
      event.layer.__zoneId = undefined;
      configureZoneLayer(event.layer);
      window.dispatchEvent(new CustomEvent<Zone>('efp:zone-created', { detail: zone }));
      // pm:create sparar en historikpost innan zonmetadata har kopplats på lagret.
      // Spara därför en ny snapshot här så att undo kan återställa zonen som zon.
      saveHistory();
    };
    map.on('pm:create', onCreate); map.on('pm:create', onNewPolygon); map.on('pm:remove', onRemove); onReady(api);
    return () => { map.off('pm:create', onCreate); map.off('pm:create', onNewPolygon); map.off('pm:remove', onRemove); };
  }, [map]);
  useEffect(() => {
    if (!geomanMap.pm) return;
    const persistedZones = zones.filter(zone => !zone.id.startsWith('draft-'));
    serverZoneLayers.current.forEach(layer => layer.remove());
    serverZoneLayers.current = persistedZones.map(zone => {
      const layer: any = createZoneLayer(zone).addTo(map);
      layer.__zoneId = zone.id; layer.__zone = zone; geomanMap.pm.reInitLayer?.(layer);
      configureZoneLayer(layer);
      return layer;
    });
    // Behåll originaluppsättningen under hela den lokala redigeringssessionen.
    // Annars försvinner ID:n för zoner som tagits bort genom split/merge innan
    // saveChanges hinner skicka deras DELETE-anrop.
    if (!serverBaselineInitialized.current && persistedZones.length > 0) {
      initialServerZoneIds.current = persistedZones.map(zone => zone.id);
      serverBaselineInitialized.current = true;
    }
    if (serverZoneLayers.current.length > 0) {
      const zoneBounds = L.featureGroup(serverZoneLayers.current).getBounds();
      if (zoneBounds.isValid()) map.fitBounds(zoneBounds, { padding: [48, 48], maxZoom: 16, animate: false });
    }
    history.current = [snapshot()]; historyIndex.current = 0; onReady(api);
  }, [map, persistedZoneKey]);
  useEffect(() => {
    serverZoneLayers.current.forEach((layer: any) => {
      if (!layer.__zoneId) return;
      const selected = layer.__zoneId === selectedZoneId;
      const hidden = hiddenZoneIds[layer.__zoneId] === true;
      if (hidden) layer.remove?.();
      else if (!map.hasLayer(layer)) layer.addTo?.(map);
      layer.setStyle?.({ color: selected ? '#f59e0b' : '#dc2626', weight: selected ? 6 : 4, opacity: 1, fillOpacity: 0.15 });
    });
  }, [selectedZoneId, hiddenZoneIds, zones]);
  useEffect(() => {
    if (!selectedZoneId) return;
    const layer = getLayers().find((candidate: any) => candidate.__zoneId === selectedZoneId || candidate.__zone?.id === selectedZoneId);
    const bounds = layer?.getBounds?.();
    if (bounds?.isValid?.()) map.panTo(bounds.getCenter(), { animate: true });
  }, [selectedZoneId, zones]);
  useEffect(() => {
    if (zones.length > 0) return;
    let active = true;
    const fitSweden = () => {
      if (!active) return;
      map.fitBounds(L.latLngBounds([[55.2, 10.8], [69.2, 24.2]]), { padding: [32, 32], animate: false });
    };
    if (!navigator.geolocation) {
      fitSweden();
      return () => { active = false; };
    }
    navigator.geolocation.getCurrentPosition(
      position => { if (active) map.setView([position.coords.latitude, position.coords.longitude], 13, { animate: false }); },
      fitSweden,
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 5000 },
    );
    return () => { active = false; };
  }, [map, zones.length]);
  return <><TextPlacement enabled={textMode} onPlace={(lat, lng) => { setTextMode(false); onToolChange('none'); const text = window.prompt('Text på kartan', '')?.trim(); if (text) addTextLayer(text, lat, lng); }} /><ReferencePointPlacement enabled={referencePointMode !== null} onPlace={(lat, lng) => { if (referencePointMode) void saveReferencePoint(referencePointMode, lat, lng); }} /> <ReferencePointLayers referencePoints={referencePoints} />{toolbarTarget && createPortal(<><button className={activeTool === 'Split' ? 'active' : ''} title="Välj en zon och rita sedan en fri linje från kant till kant" aria-label="Dela zon: välj en zon och rita sedan en fri linje" onClick={() => { onToolChange('Split'); api.split(); }}>✂ Dela zon</button><button className={activeTool === 'Merge' ? 'active' : ''} title="Välj två zoner som delar en gemensam kant" aria-label="Slå ihop zoner: välj två angränsande zoner" onClick={() => { onToolChange('Merge'); api.merge(); }}>⇄ Slå ihop zoner</button><button className={referencePointMode === 'Pls' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Pls'); }}>📍 PLS</button><button className={referencePointMode === 'Lkp' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Lkp'); }}>📍 LKP</button><button className={referencePointMode === 'Ipp' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Ipp'); }}>📍 IPP</button></>, toolbarTarget)}</>;
}

function TextPlacement({ enabled, onPlace }: { enabled: boolean; onPlace: (lat: number, lng: number) => void }) { useMapEvents({ click: event => { if (enabled) onPlace(event.latlng.lat, event.latlng.lng); } }); return null; }
function toLatLngs(coordinates: number[][]): [number, number][] { return coordinates.map(([lng, lat]) => [lat, lng]); }
function simplifyRing(coordinates: number[][], toleranceMeters: number): number[][] {
  const ring = coordinates[0]?.[0] === coordinates.at(-1)?.[0] && coordinates[0]?.[1] === coordinates.at(-1)?.[1] ? coordinates.slice(0, -1) : coordinates;
  if (ring.length < 4) return coordinates;
  const latitude = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
  const projected = ring.map(([longitude, lat]) => ({ x: longitude * 111320 * Math.cos(latitude * Math.PI / 180), y: lat * 110540 }));
  const simplified = simplifyRdp(projected, toleranceMeters);
  if (simplified.length < 3) return coordinates;
  const result = simplified.map(point => [point.x / (111320 * Math.cos(latitude * Math.PI / 180)), point.y / 110540]);
  result.push([...result[0]]);
  return result;
}
function simplifyRdp(points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  let maxDistance = tolerance;
  let splitIndex = -1;
  const start = points[0]; const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index++) {
    const distance = perpendicularDistance(points[index], start, end);
    if (distance > maxDistance) { maxDistance = distance; splitIndex = index; }
  }
  if (splitIndex < 0) return [start, end];
  return [...simplifyRdp(points.slice(0, splitIndex + 1), tolerance).slice(0, -1), ...simplifyRdp(points.slice(splitIndex), tolerance)];
}
function perpendicularDistance(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }): number {
  const dx = end.x - start.x; const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy);
}
function calculateAreaKm2(coordinates: number[][]): number {
  const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length * Math.PI / 180;
  const points = coordinates.map(([longitude, lat]) => [longitude * 111.32 * Math.cos(latitude), lat * 111.32]);
  let area = 0;
  for (let index = 0; index < points.length - 1; index++) area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  return Math.abs(area) / 2;
}
function isValidPolygonCoordinates(coordinates: number[][]): boolean {
  if (coordinates.length < 4) return false;
  const distinct = new Set(coordinates.slice(0, -1).map(([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)}`));
  if (distinct.size < 3) return false;
  const first = coordinates[0]; const last = coordinates[coordinates.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
  return Math.abs(coordinates.slice(0, -1).reduce((sum, current, index) => {
    const next = coordinates[index + 1];
    return sum + current[0] * next[1] - next[0] * current[1];
  }, 0)) > 1e-12;
}
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
