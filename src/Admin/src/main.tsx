import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

type Investigation = { id: string; name: string; status: string; description?: string };
type Zone = { id: string; name: string; status: string; priority: number; geometry: { coordinates: number[][] } };
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';
const center: [number, number] = [59.33, 18.06];

function App() {
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [selected, setSelected] = useState<Investigation | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = async () => setInvestigations(await fetch(`${API}/investigations`).then(r => r.json()));
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (selected) void fetch(`${API}/investigations/${selected.id}/zones`).then(r => r.json()).then(setZones); }, [selected]);
  const createInvestigation = async () => {
    setError('');
    const response = await fetch(`${API}/investigations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: null }) });
    if (!response.ok) return setError(await response.text());
    setName(''); await load();
  };
  const saveZone = async () => {
    if (!selected || draft.length < 3) return setError('Rita minst tre hörnpunkter för en zon.');
    const ring = [...draft, draft[0]].map(([lat, lng]) => [lng, lat]);
    const response = await fetch(`${API}/investigations/${selected.id}/zones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Zon ${zones.length + 1}`, status: 'NotStarted', searchMethod: 'Patrol', priority: zones.length + 1, geometry: { coordinates: ring } }) });
    if (!response.ok) return setError(await response.text());
    setDraft([]); setZones(await fetch(`${API}/investigations/${selected.id}/zones`).then(r => r.json()));
  };
  return <main>
    <header><h1>EFP sökledning</h1><span>Admin MVP</span></header>
    <section className="toolbar"><input value={name} onChange={e => setName(e.target.value)} placeholder="Ny sökinsats" /><button onClick={() => void createInvestigation()}>Skapa</button><button disabled={!selected || draft.length < 3} onClick={() => void saveZone()}>Spara zon</button><a href={selected ? `${API}/investigations/${selected.id}/zones.geojson` : '#'}>Exportera zoner</a></section>
    {error && <p className="error">{error}</p>}
    <div className="layout"><aside><h2>Sökinsatser</h2>{investigations.map(item => <button className={selected?.id === item.id ? 'selected' : ''} onClick={() => setSelected(item)} key={item.id}>{item.name}<small>{item.status}</small></button>)}</aside><div className="map"><MapContainer center={center} zoom={10} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><ClickCapture points={draft} setPoints={setDraft} />{zones.map(zone => <Polygon key={zone.id} positions={zone.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])} pathOptions={{ color: '#dc2626' }} />)}{draft.length > 0 && <Polyline positions={draft} pathOptions={{ color: '#2563eb', dashArray: '6' }} />}</MapContainer></div></div>
  </main>;
}
function ClickCapture({ points, setPoints }: { points: [number, number][], setPoints: (p: [number, number][]) => void }) { useMapEvents({ click: event => setPoints([...points, [event.latlng.lat, event.latlng.lng]]) }); return null; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
