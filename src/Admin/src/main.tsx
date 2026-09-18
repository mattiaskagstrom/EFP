import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';

type Investigation = { id: string; name: string; status: string; description?: string };
type Zone = { id: string; name: string; status: string; priority: number; geometry: { coordinates: number[][] } };
type DrawMode = 'Polygon' | 'Rectangle' | 'Circle' | 'Line';
type ActiveTool = 'none' | DrawMode | 'Text' | 'Edit' | 'Drag' | 'Remove';
type MapType = 'osm' | 'topographic' | 'satellite';
type StrokeStyle = 'solid' | 'dash' | 'dot' | 'dashdot';
type DrawingSnapshot = { kind: 'shape' | 'text'; shape?: string; geometry?: GeoJSON.Geometry; radius?: number; zoneId?: string; style?: { color: string; weight: number; dashArray?: string }; text?: string; lat?: number; lng?: number };
type EditorApi = { draw: (mode: DrawMode) => void; text: () => void; edit: () => void; drag: () => void; remove: () => void; undo: () => void; redo: () => void; latestPolygon: () => number[][] | null; canUndo: () => boolean; canRedo: () => boolean };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';
const center: [number, number] = [59.33, 18.06];
const strokeMap: Record<StrokeStyle, string | undefined> = { solid: undefined, dash: '12 8', dot: '2 8', dashdot: '12 6 2 6' };

function App() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState<Investigation | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');
  const [textValue, setTextValue] = useState('');
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [mapType, setMapType] = useState<MapType>('osm');
  const [error, setError] = useState('');

  const load = async () => setInvestigations(await fetch(`${API}/investigations`).then(r => r.json()));
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selected) void fetch(`${API}/investigations/${selected.id}/zones`).then(r => r.json()).then(setZones); }, [selected]);

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
    setName(''); await load();
  };
  const saveLatestZone = async () => {
    if (!selected) return setError('Välj en sökinsats först.');
    const coordinates = editor?.latestPolygon();
    if (!coordinates) return setError('Rita eller välj en polygon/fyrkant först.');
    const response = await fetch(`${API}/investigations/${selected.id}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Zon ${zones.length + 1}`, status: 'NotStarted', searchMethod: 'Patrol', priority: zones.length + 1, geometry: { coordinates } }) });
    if (!response.ok) return setError(await response.text());
    setZones(await fetch(`${API}/investigations/${selected.id}/zones`).then(r => r.json()));
  };

  const chooseTool = (tool: ActiveTool, action: () => void) => { setActiveTool(tool); action(); };
  const mapLayers: Record<MapType, { url: string; attribution: string }> = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
    topographic: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  };
  const selectedMapLayer = mapLayers[mapType];

  return <main>
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    {error && <p className="error">{error}</p>}
    <div className="layout"><aside><h2>Sökinsatser</h2><div className="investigation-create"><input value={name} onChange={event => setName(event.target.value)} placeholder="Namn på ny sökinsats" /><button onClick={() => void createInvestigation()}>Skapa sökinsats</button></div>{investigations.map(item => <button className={selected?.id === item.id ? 'selected' : ''} onClick={() => setSelected(item)} key={item.id}>{item.name}<small>{item.status}</small></button>)}</aside><div className={`map map-cursor-${activeTool.toLowerCase()}`}><MapContainer center={center} zoom={10} scrollWheelZoom><TileLayer attribution={selectedMapLayer.attribution} url={selectedMapLayer.url} /><MapEditor color={color} strokeStyle={strokeStyle} textValue={textValue} zones={zones} activeTool={activeTool} onToolChange={setActiveTool} onReady={setEditor} /></MapContainer><div className="map-type-control"><label htmlFor="map-type">Karttyp</label><select id="map-type" value={mapType} onChange={event => setMapType(event.target.value as MapType)}><option value="osm">Standard</option><option value="topographic">Topografisk</option><option value="satellite">Satellit</option></select></div><div className="map-toolbar" aria-label="Ritverktyg"><div className="map-toolbar-group"><button className={activeTool === 'Polygon' ? 'active' : ''} title="Rita polygon" onClick={() => chooseTool('Polygon', () => editor?.draw('Polygon'))}>⬡ Polygon</button><button className={activeTool === 'Rectangle' ? 'active' : ''} title="Rita fyrkant" onClick={() => chooseTool('Rectangle', () => editor?.draw('Rectangle'))}>▣ Fyrkant</button><button className={activeTool === 'Circle' ? 'active' : ''} title="Rita cirkel" onClick={() => chooseTool('Circle', () => editor?.draw('Circle'))}>◯ Cirkel</button><button className={activeTool === 'Line' ? 'active' : ''} title="Rita sträcka" onClick={() => chooseTool('Line', () => editor?.draw('Line'))}>╱ Sträcka</button><button className={activeTool === 'Text' ? 'active' : ''} title="Placera text" onClick={() => chooseTool('Text', () => editor?.text())}>T Text</button></div><div className="map-toolbar-group"><label>Färg <input className="color-input" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Linje <select value={strokeStyle} onChange={event => setStrokeStyle(event.target.value as StrokeStyle)}><option value="solid">Heldragen</option><option value="dash">Sträckad</option><option value="dot">Punktad</option><option value="dashdot">Sträck-punkt</option></select></label><input value={textValue} onChange={event => setTextValue(event.target.value)} placeholder="Text på kartan" /></div><div className="map-toolbar-group"><button className={activeTool === 'Edit' ? 'active' : ''} onClick={() => chooseTool('Edit', () => editor?.edit())}>✎ Redigera</button><button className={activeTool === 'Drag' ? 'active' : ''} onClick={() => chooseTool('Drag', () => editor?.drag())}>✥ Flytta</button><button className={activeTool === 'Remove' ? 'active' : ''} onClick={() => chooseTool('Remove', () => editor?.remove())}>⌫ Ta bort</button><button disabled={!editor?.canUndo()} onClick={() => editor?.undo()}>↶ Ångra</button><button disabled={!editor?.canRedo()} onClick={() => editor?.redo()}>↷ Gör om</button><button onClick={() => void saveLatestZone()}>Spara zon</button><a href={selected ? `${API}/investigations/${selected.id}/zones.geojson` : '#'}>Exportera zoner</a></div></div></div></div>
  </main>;
}

function MapEditor({ color, strokeStyle, textValue, zones, activeTool, onToolChange, onReady }: { color: string; strokeStyle: StrokeStyle; textValue: string; zones: Zone[]; activeTool: ActiveTool; onToolChange: (tool: ActiveTool) => void; onReady: (api: EditorApi) => void }) {
  const map = useMap();
  const history = useRef<DrawingSnapshot[][]>([[]]);
  const historyIndex = useRef(0);
  const restoring = useRef(false);
  const textLayers = useRef<L.Marker[]>([]);
  const serverZoneLayers = useRef<any[]>([]);
  const textRemovalMode = useRef(false);
  const [textMode, setTextMode] = useState(false);
  const settings = useRef({ color, strokeStyle, textValue });
  settings.current = { color, strokeStyle, textValue };
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
  const syncServerZone = async (layer: any) => {
    const zone = layer.__zone as Zone | undefined;
    if (!zone) return;
    const geometry = layer.toGeoJSON().geometry;
    await fetch(`${API}/investigations/${zone.id}/zones/${zone.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: zone.name, status: zone.status, searchMethod: 'Patrol', priority: zone.priority, geometry }) });
  };
  const api: EditorApi = {
    draw: mode => { textRemovalMode.current = false; setTextMode(false); geomanMap.pm?.disableGlobalEditMode?.(); geomanMap.pm?.disableGlobalDragMode?.(); geomanMap.pm?.disableGlobalRemovalMode?.(); geomanMap.pm?.enableDraw?.(mode, { pathOptions: { color: settings.current.color, weight: 4, dashArray: strokeMap[settings.current.strokeStyle], fillColor: settings.current.color, fillOpacity: 0.15 } }); },
    text: () => { textRemovalMode.current = false; geomanMap.pm?.disableDraw?.(); setTextMode(true); }, edit: () => { textRemovalMode.current = false; setTextMode(false); geomanMap.pm?.enableGlobalEditMode?.(); }, drag: () => { textRemovalMode.current = false; setTextMode(false); geomanMap.pm?.enableGlobalDragMode?.(); }, remove: () => { textRemovalMode.current = true; setTextMode(false); geomanMap.pm?.enableGlobalRemovalMode?.(); }, undo, redo, latestPolygon, canUndo: () => historyIndex.current > 0, canRedo: () => historyIndex.current < history.current.length - 1
  };
  useEffect(() => {
    if (!geomanMap.pm) return;
    geomanMap.pm.setGlobalOptions?.({ continueDrawing: false });
    const onCreate = (event: any) => { event.layer.pm?.enable?.({ allowSelfIntersection: false }); event.layer.on('pm:edit pm:dragend', () => { void syncServerZone(event.layer); saveHistory(); }); event.layer.on('pm:remove', () => { if (event.layer.__zoneId) void fetch(`${API}/investigations/${event.layer.__zoneId}/zones/${event.layer.__zoneId}`, { method: 'DELETE' }); saveHistory(); }); saveHistory(); onToolChange('none'); };
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
      layer.on('pm:edit pm:dragend', () => { void syncServerZone(layer); saveHistory(); });
      layer.on('pm:remove', () => { void fetch(`${API}/investigations/${zone.id}/zones/${zone.id}`, { method: 'DELETE' }); saveHistory(); });
      return layer;
    });
    history.current = [snapshot()]; historyIndex.current = 0; onReady(api);
  }, [map, zones]);
  return <TextPlacement enabled={textMode} onPlace={(lat, lng) => { setTextMode(false); onToolChange('none'); const text = settings.current.textValue.trim() || window.prompt('Text på kartan', '')?.trim(); if (text) addTextLayer(text, lat, lng); }} />;
}

function TextPlacement({ enabled, onPlace }: { enabled: boolean; onPlace: (lat: number, lng: number) => void }) { useMapEvents({ click: event => { if (enabled) onPlace(event.latlng.lat, event.latlng.lng); } }); return null; }
function toLatLngs(coordinates: number[][]): [number, number][] { return coordinates.map(([lng, lat]) => [lat, lng]); }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
