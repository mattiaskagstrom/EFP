import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';

type Investigation = { id: string; name: string; status: string; description?: string };
type Zone = { id: string; name: string; status: string; priority: number; geometry: { coordinates: number[][] } };
type Track = { id: string; callsign?: string; sourceFile?: string; geometry: { type: 'LineString'; coordinates: number[][] } };
type DrawMode = 'Polygon' | 'Rectangle' | 'Circle' | 'Line';
type ActiveTool = 'none' | DrawMode | 'Text' | 'Edit' | 'Drag' | 'Remove';
type MapType = 'osm' | 'topographic' | 'satellite';
type StrokeStyle = 'solid' | 'dash' | 'dot' | 'dashdot';
type DrawingSnapshot = { kind: 'shape' | 'text'; shape?: string; geometry?: GeoJSON.Geometry; radius?: number; zoneId?: string; style?: { color: string; weight: number; dashArray?: string }; text?: string; lat?: number; lng?: number };
type EditorApi = { draw: (mode: DrawMode) => void; text: () => void; edit: () => void; drag: () => void; remove: () => void; stop: () => void; undo: () => void; redo: () => void; save: () => Promise<void>; discard: () => void; latestPolygon: () => number[][] | null; canUndo: () => boolean; canRedo: () => boolean };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';
const center: [number, number] = [59.33, 18.06];
const strokeMap: Record<StrokeStyle, string | undefined> = { solid: undefined, dash: '12 8', dot: '2 8', dashdot: '12 6 2 6' };

function App() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState<Investigation | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [visibleTracks, setVisibleTracks] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [mapType, setMapType] = useState<MapType>('osm');
  const [error, setError] = useState('');

  const load = async () => setInvestigations(await fetch(`${API}/investigations`).then(r => r.json()));
  useEffect(() => { void load(); }, []);
  const loadSelectedData = async (investigation: Investigation) => {
    const [zoneResponse, trackResponse] = await Promise.all([
      fetch(`${API}/investigations/${investigation.id}/zones`),
      fetch(`${API}/investigations/${investigation.id}/tracks.geojson`),
    ]);
    const loadedZones = zoneResponse.ok ? await zoneResponse.json() : [];
    const trackCollection = trackResponse.ok ? await trackResponse.json() : { features: [] };
    const loadedTracks = (trackCollection.features ?? []).map((feature: any) => ({
      id: String(feature.id),
      callsign: feature.properties?.callsign,
      sourceFile: feature.properties?.sourceFile,
      geometry: feature.geometry,
    })) as Track[];
    setZones(loadedZones);
    setTracks(loadedTracks);
    setVisibleTracks(Object.fromEntries(loadedTracks.map(track => [track.id, true])));
  };
  useEffect(() => { if (selected) void loadSelectedData(selected); else { setZones([]); setTracks([]); setVisibleTracks({}); setEditor(null); } }, [selected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); editor?.undo(); }
      if (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z')) { event.preventDefault(); editor?.redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  const createInvestigation = async () => {
    setError('');
    const response = await fetch(`${API}/investigations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: null }) });
    if (!response.ok) return setError(await response.text());
    const created = await response.json() as Investigation;
    setName(''); await load(); setSelected(created);
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
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    setError('');
    const form = new FormData(); form.append('file', file); form.append('callsign', 'GPX-import');
    const response = await fetch(`${API}/investigations/${selected.id}/tracks/import?callsign=GPX-import`, { method: 'POST', body: form });
    if (!response.ok) { setError((await response.text()) || `GPX-importen misslyckades (HTTP ${response.status}). Kontrollera att filen innehåller minst två spårpunkter.`); return; }
    await loadSelectedData(selected);
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
    setError('');
  };

  const chooseTool = (tool: ActiveTool, action: () => void) => { if (activeTool === tool) { setActiveTool('none'); editor?.stop(); return; } setActiveTool(tool); action(); };
  const mapLayers: Record<MapType, { url: string; attribution: string }> = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
    topographic: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  };
  const selectedMapLayer = mapLayers[mapType];

  if (!selected) return <main className="selection-screen">
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    {error && <p className="error">{error}</p>}
    <section className="investigation-picker"><h2>Välj sökinsats</h2><p>Välj en befintlig sökinsats eller skapa en ny för att öppna kartan och dess underlag.</p><div className="investigation-create"><input value={name} onChange={event => setName(event.target.value)} placeholder="Namn på ny sökinsats" /><button onClick={() => void createInvestigation()}>Skapa sökinsats</button></div><div className="investigation-list">{investigations.map(item => <button onClick={() => setSelected(item)} key={item.id}>{item.name}<small>{item.status}</small></button>)}</div></section>
  </main>;

  return <main>
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    {error && <p className="error">{error}</p>}
    <div className="layout"><aside className="investigation-sidebar"><button className="back-button" onClick={() => setSelected(null)}>← Byt sökinsats</button><h2>{selected.name}</h2><small>{selected.status}</small><section className="sidebar-section"><h3>Kartändringar</h3><button onClick={() => void saveMapChanges()}>Spara ändringar</button><button className="discard-button" onClick={() => void discardMapChanges()}>Släng ändringar</button></section><details className="sidebar-section export-section" open><summary>Exportera</summary><div className="export-links"><strong>Zoner</strong><a href={`${API}/investigations/${selected.id}/zones.geojson`}>GeoJSON</a><a href={`${API}/investigations/${selected.id}/zones.gpx`}>GPX</a><strong>Spår</strong><a href={`${API}/investigations/${selected.id}/tracks.gpx`}>GPX</a><a href={`${API}/investigations/${selected.id}/tracks.geojson`}>GeoJSON</a></div></details><section className="sidebar-section"><h3>Importera zoner från GPX</h3><input id="gpx-zone-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importZoneGpx(event)} /><label className="file-button" htmlFor="gpx-zone-import">Välj zon-GPX-fil</label><p className="muted">GPX-spår som bildar polygoner importeras som redigerbara zoner.</p></section><section className="sidebar-section"><h3>Importera spår från GPX</h3><input id="gpx-track-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importGpx(event)} /><label className="file-button" htmlFor="gpx-track-import">Välj spår-GPX-fil</label>{tracks.length === 0 ? <p className="muted">Inga spårimporter ännu.</p> : <div className="track-list">{tracks.map(track => <label key={track.id}><input type="checkbox" checked={visibleTracks[track.id] ?? true} onChange={event => setVisibleTracks(current => ({ ...current, [track.id]: event.target.checked }))} /><span>{track.sourceFile ?? track.callsign ?? 'GPX-import'}</span></label>)}</div>}</section></aside><div className={`map map-cursor-${activeTool.toLowerCase()}`}><MapContainer key={selected.id} center={center} zoom={10} scrollWheelZoom><TileLayer attribution={selectedMapLayer.attribution} url={selectedMapLayer.url} /><TrackLayers tracks={tracks} visibleTracks={visibleTracks} /><MapEditor investigationId={selected.id} color={color} strokeStyle={strokeStyle} zones={zones} activeTool={activeTool} onToolChange={setActiveTool} onReady={api => setEditor({ ...api })} /></MapContainer><div className="map-type-control"><label htmlFor="map-type">Karttyp</label><select id="map-type" value={mapType} onChange={event => setMapType(event.target.value as MapType)}><option value="osm">Standard</option><option value="topographic">Topografisk</option><option value="satellite">Satellit</option></select></div><div className="map-toolbar" aria-label="Ritverktyg"><div className="map-toolbar-group"><button className={activeTool === 'Polygon' ? 'active' : ''} title="Rita polygon" onClick={() => chooseTool('Polygon', () => editor?.draw('Polygon'))}>⬡ Polygon</button><button className={activeTool === 'Rectangle' ? 'active' : ''} title="Rita fyrkant" onClick={() => chooseTool('Rectangle', () => editor?.draw('Rectangle'))}>▣ Fyrkant</button><button className={activeTool === 'Circle' ? 'active' : ''} title="Rita cirkel" onClick={() => chooseTool('Circle', () => editor?.draw('Circle'))}>◯ Cirkel</button><button className={activeTool === 'Line' ? 'active' : ''} title="Rita sträcka" onClick={() => chooseTool('Line', () => editor?.draw('Line'))}>╱ Sträcka</button><button className={activeTool === 'Text' ? 'active' : ''} title="Placera text" onClick={() => chooseTool('Text', () => editor?.text())}>T Text</button></div><div className="map-toolbar-group"><label>Färg <input className="color-input" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Linje <select value={strokeStyle} onChange={event => setStrokeStyle(event.target.value as StrokeStyle)}><option value="solid">Heldragen</option><option value="dash">Sträckad</option><option value="dot">Punktad</option><option value="dashdot">Sträck-punkt</option></select></label></div><div className="map-toolbar-group"><button className={activeTool === 'Edit' ? 'active' : ''} onClick={() => chooseTool('Edit', () => editor?.edit())}>✎ Redigera</button><button className={activeTool === 'Drag' ? 'active' : ''} onClick={() => chooseTool('Drag', () => editor?.drag())}>✥ Flytta</button><button className={activeTool === 'Remove' ? 'active' : ''} onClick={() => chooseTool('Remove', () => editor?.remove())}>⌫ Ta bort</button><button disabled={!editor?.canUndo()} onClick={() => editor?.undo()}>↶ Ångra</button><button disabled={!editor?.canRedo()} onClick={() => editor?.redo()}>↷ Gör om</button></div></div></div></div>
  </main>;
}

function TrackLayers({ tracks, visibleTracks }: { tracks: Track[]; visibleTracks: Record<string, boolean> }) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    tracks.filter(track => visibleTracks[track.id] !== false).forEach(track => {
      L.geoJSON({ type: 'Feature', properties: {}, geometry: track.geometry } as GeoJSON.Feature, { style: { color: '#7c3aed', weight: 4, opacity: 0.85 } }).addTo(group);
    });
    return () => { group.remove(); };
  }, [map, tracks, visibleTracks]);
  return null;
}

function MapEditor({ investigationId, color, strokeStyle, zones, activeTool, onToolChange, onReady }: { investigationId: string; color: string; strokeStyle: StrokeStyle; zones: Zone[]; activeTool: ActiveTool; onToolChange: (tool: ActiveTool) => void; onReady: (api: EditorApi) => void }) {
  const map = useMap();
  const history = useRef<DrawingSnapshot[][]>([[]]);
  const historyIndex = useRef(0);
  const restoring = useRef(false);
  const textLayers = useRef<L.Marker[]>([]);
  const serverZoneLayers = useRef<any[]>([]);
  const initialServerZoneIds = useRef<string[]>([]);
  const textRemovalMode = useRef(false);
  const [textMode, setTextMode] = useState(false);
  const settings = useRef({ color, strokeStyle });
  settings.current = { color, strokeStyle };
  const geomanMap = map as L.Map & { pm?: any };
  const getLayers = () => geomanMap.pm?.getGeomanLayers?.() ?? [];
  const styleFor = (layer: any) => ({ color: layer.options?.color ?? '#2563eb', weight: layer.options?.weight ?? 4, dashArray: layer.options?.dashArray });
  const snapshot = (): DrawingSnapshot[] => {
    const shapes = getLayers().map((layer: any) => {
      const shape = layer instanceof L.Circle ? 'Circle' : layer.pm?.getShape?.() ?? layer.toGeoJSON().geometry.type;
      if (shape === 'Circle') return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, radius: layer.getRadius(), zoneId: layer.__zoneId, style: styleFor(layer) };
      return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, zoneId: layer.__zoneId, style: styleFor(layer) };
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
    items.forEach(item => {
      if (item.kind === 'text' && item.text && item.lat !== undefined && item.lng !== undefined) { addTextLayer(item.text, item.lat, item.lng); return; }
      if (!item.geometry) return;
      const geometry = item.geometry as any; const coordinates = geometry.coordinates; const options = { ...item.style, fillColor: item.style?.color, fillOpacity: 0.15 }; let layer: any;
      if (item.shape === 'Circle') layer = L.circle([coordinates[1], coordinates[0]], { ...options, radius: item.radius ?? 20 }).addTo(map);
      else if (item.shape === 'Rectangle') layer = L.rectangle(toLatLngs(coordinates[0]), options).addTo(map);
      else if (item.shape === 'Line' || geometry.type === 'LineString') layer = L.polyline(toLatLngs(coordinates), options).addTo(map);
      else layer = L.polygon(toLatLngs(coordinates[0]), options).addTo(map);
      if (item.zoneId) layer.__zoneId = item.zoneId;
      geomanMap.pm?.reInitLayer?.(layer);
    });
    restoring.current = false;
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
  const getPolygonCoordinates = (layer: any): number[][] | null => {
    const shape = layer.pm?.getShape?.() ?? layer.toGeoJSON().geometry.type;
    if (!['Polygon', 'Rectangle'].includes(shape)) return null;
    return (layer.toGeoJSON().geometry as any).coordinates?.[0] ?? null;
  };
  const saveChanges = async () => {
    const layers = getLayers();
    const currentZoneIds = new Set<string>();
    const requests: Promise<Response>[] = [];
    for (const layer of layers) {
      const coordinates = getPolygonCoordinates(layer);
      if (!coordinates) continue;
      const existing = layer.__zone as Zone | undefined;
      if (existing) {
        currentZoneIds.add(existing.id);
        requests.push(fetch(`${API}/investigations/${investigationId}/zones/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: existing.name, status: existing.status, searchMethod: 'Patrol', priority: existing.priority, geometry: { coordinates } }) }));
      } else {
        requests.push(fetch(`${API}/investigations/${investigationId}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Zon ${layers.length}`, status: 'NotStarted', searchMethod: 'Patrol', priority: layers.length, geometry: { coordinates } }) }));
      }
    }
    for (const zoneId of initialServerZoneIds.current) {
      if (!currentZoneIds.has(zoneId)) requests.push(fetch(`${API}/investigations/${investigationId}/zones/${zoneId}`, { method: 'DELETE' }));
    }
    const responses = await Promise.all(requests);
    const failed = responses.find(response => !response.ok);
    if (failed) throw new Error((await failed.text()) || `Kunde inte spara en eller flera zoner (HTTP ${failed.status}).`);
  };
  const discardChanges = () => { stop(); history.current = [history.current[0]]; historyIndex.current = 0; onReady(api); };
  const stop = () => { textRemovalMode.current = false; setTextMode(false); geomanMap.pm?.disableDraw?.(); geomanMap.pm?.disableGlobalEditMode?.(); geomanMap.pm?.disableGlobalDragMode?.(); geomanMap.pm?.disableGlobalRemovalMode?.(); };
  const api: EditorApi = {
    draw: mode => { stop(); geomanMap.pm?.enableDraw?.(mode, { pathOptions: { color: settings.current.color, weight: 4, dashArray: strokeMap[settings.current.strokeStyle], fillColor: settings.current.color, fillOpacity: 0.15 } }); },
    text: () => { stop(); setTextMode(true); }, edit: () => { stop(); geomanMap.pm?.enableGlobalEditMode?.(); }, drag: () => { stop(); geomanMap.pm?.enableGlobalDragMode?.(); }, remove: () => { stop(); textRemovalMode.current = true; geomanMap.pm?.enableGlobalRemovalMode?.(); }, stop, undo, redo, save: saveChanges, discard: discardChanges, latestPolygon, canUndo: () => historyIndex.current > 0, canRedo: () => historyIndex.current < history.current.length - 1
  };
  useEffect(() => {
    if (!geomanMap.pm) return;
    geomanMap.pm.setGlobalOptions?.({ continueDrawing: false });
    const onCreate = (event: any) => { event.layer.pm?.enable?.({ allowSelfIntersection: false }); event.layer.on('pm:edit pm:dragend', saveHistory); event.layer.on('pm:remove', saveHistory); saveHistory(); onToolChange('none'); };
    const onRemove = () => saveHistory();
    map.on('pm:create', onCreate); map.on('pm:remove', onRemove); onReady(api);
    return () => { map.off('pm:create', onCreate); map.off('pm:remove', onRemove); };
  }, [map]);
  useEffect(() => {
    if (!geomanMap.pm) return;
    serverZoneLayers.current.forEach(layer => layer.remove());
    serverZoneLayers.current = zones.map(zone => {
      const layer: any = L.polygon(toLatLngs(zone.geometry.coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 }).addTo(map);
      layer.__zoneId = zone.id; layer.__zone = zone; geomanMap.pm.reInitLayer?.(layer);
      layer.on('pm:edit pm:dragend', saveHistory);
      layer.on('pm:remove', saveHistory);
      return layer;
    });
    initialServerZoneIds.current = zones.map(zone => zone.id);
    history.current = [snapshot()]; historyIndex.current = 0; onReady(api);
  }, [map, zones]);
  return <TextPlacement enabled={textMode} onPlace={(lat, lng) => { setTextMode(false); onToolChange('none'); const text = window.prompt('Text på kartan', '')?.trim(); if (text) addTextLayer(text, lat, lng); }} />;
}

function TextPlacement({ enabled, onPlace }: { enabled: boolean; onPlace: (lat: number, lng: number) => void }) { useMapEvents({ click: event => { if (enabled) onPlace(event.latlng.lat, event.latlng.lng); } }); return null; }
function toLatLngs(coordinates: number[][]): [number, number][] { return coordinates.map(([lng, lat]) => [lat, lng]); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
