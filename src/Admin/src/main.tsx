import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { CircleMarker, ImageOverlay, MapContainer, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { featureCollection } from '@turf/helpers';
import polygonToLine from '@turf/polygon-to-line';
import polygonize from '@turf/polygonize';
import polygonUnion from '@turf/union';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { filterSectorsByName } from './sectorSearch';
import { InvestigationEditButton } from './InvestigationEditButton';
import { exportFormats, type ExportFormat, type ExportSelection } from './exportFormats';
import { investigationPath, navigateTo, parseRoute, type AppRole, type AppRoute } from './routing';
import { TrackList, type Track } from './TrackList';
import { validateTrackFile } from './trackUpload';

type Investigation = { id: string; name: string; status: string; isPublic?: boolean; description?: string | null; startsAt?: string | null; endsAt?: string | null; searchConditions?: string | null };
type InvestigationAdmin = { id: string; username: string; isOwner: boolean; createdAt: string };
type ReferencePoint = { id: string; type: 'Pls' | 'Lkp' | 'Ipp'; label: string; longitude: number; latitude: number };
type Finding = { id: string; submittedBy: string; description?: string | null; observedAt: string; submittedAt: string; hasImage?: boolean; imageUrl?: string | null; longitude: number; latitude: number };
type Sector = { id: string; name: string; status: string; priority: number; searched: boolean; searchedAt?: string | null; points: number; showName: boolean; showArea: boolean; poa?: number | null; areaKm2?: number; lengthKm?: number; geometry: { type?: 'Polygon' | 'LineString'; coordinates: number[][] } };
type InvestigationMap = { id: string; name: string; contentType: string; west: number; south: number; east: number; north: number; imageUrl: string };
type DrawMode = 'Polygon' | 'Rectangle' | 'Circle' | 'Line';
type ActiveTool = 'none' | DrawMode | 'Text' | 'Finding' | 'Edit' | 'Drag' | 'Remove' | 'Split' | 'Merge';
type MapType = 'osm' | 'topographic' | 'satellite';
type StrokeStyle = 'solid' | 'dash' | 'dot' | 'dashdot';
type DrawingSnapshot = { kind: 'shape' | 'text'; shape?: string; geometry?: GeoJSON.Geometry; radius?: number; sectorId?: string; sector?: Partial<Sector>; style?: { color: string; weight: number; dashArray?: string }; text?: string; lat?: number; lng?: number };
type SectorDetails = Pick<Sector, 'name' | 'searched' | 'searchedAt' | 'points' | 'showName' | 'showArea' | 'poa'>;
type EditorApi = { draw: (mode: DrawMode) => void; text: () => void; edit: () => void; drag: () => void; remove: () => void; removeSector: (sectorId: string) => void; getInvalidSectorIds: () => string[]; split: () => void; merge: () => void; placeReferencePoint: (type: ReferencePoint['type']) => void; placeFinding: () => void; stop: () => void; undo: () => void; redo: () => void; save: () => Promise<void>; discard: () => void; updateSectorDetails: (sectorId: string, details: SectorDetails) => void; simplifySector: (sectorId: string, toleranceMeters: number) => void; latestPolygon: () => number[][] | null; canUndo: () => boolean; canRedo: () => boolean };

const API = import.meta.env.VITE_API_URL ?? '/api/v1';
// Admin cookies must be sent in local development where the API and Vite use
// different ports. Bearer-token calls also continue to work with credentials.
const nativeFetch = window.fetch.bind(window);
const fetch = (input: RequestInfo | URL, init?: RequestInit) => nativeFetch(input, { ...init, credentials: 'include' });
const center: [number, number] = [59.33, 18.06];
const strokeMap: Record<StrokeStyle, string | undefined> = { solid: undefined, dash: '12 8', dot: '2 8', dashdot: '12 6 2 6' };
const toDateTimeLocal = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : '';
const investigationStatusLabel = (status: string) => ({ Planned: 'Planerad', Active: 'Aktiv', Paused: 'Pausad', Closed: 'Avslutad', Archived: 'Arkiverad' }[status] ?? status);
type AdminIdentity = { id: string; userName: string; roles: string[] };
const normalizeAdminIdentity = (value: any): AdminIdentity | null => value ? { id: String(value.id), userName: value.userName ?? '', roles: Array.isArray(value.roles) ? value.roles : value.role ? [value.role] : [] } : null;

function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [investigationsLoaded, setInvestigationsLoaded] = useState(false);
  const [selected, setSelected] = useState<Investigation | null>(null);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [referencePoints, setReferencePoints] = useState<ReferencePoint[]>([]);
  const [ownMaps, setOwnMaps] = useState<InvestigationMap[]>([]);
  const [visibleOwnMaps, setVisibleOwnMaps] = useState<Record<string, boolean>>({});
  const [mapBounds, setMapBounds] = useState({ west: '', south: '', east: '', north: '' });
  const [sectorDrafts, setSectorDrafts] = useState<Record<string, SectorDetails>>({});
  const [tracks, setTracks] = useState<Track[]>([]);
  const [visibleTracks, setVisibleTracks] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2563eb');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('solid');
  const [editor, setEditor] = useState<EditorApi | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [mapType, setMapType] = useState<MapType>('osm');
  const [error, setError] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [expandedSectorId, setExpandedSectorId] = useState<string | null>(null);
  const [checkedSectorIds, setCheckedSectorIds] = useState<string[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [findingImages, setFindingImages] = useState<Record<string, File | null>>({});
  const [simplifyTolerance, setSimplifyTolerance] = useState(5);
  const [hiddenSectorIds, setHiddenSectorIds] = useState<Record<string, boolean>>({});
  const [invalidSectorIds, setInvalidSectorIds] = useState<string[]>([]);
  const [sectorsExpanded, setSectorsExpanded] = useState(true);
  const [tracksExpanded, setTracksExpanded] = useState(true);
  const [sectorSearch, setSectorSearch] = useState('');
  const [saveConfirmation, setSaveConfirmation] = useState(false);
  const [exportSectorIds, setExportSectorIds] = useState<string[]>([]);
  const [exportTrackIds, setExportTrackIds] = useState<string[]>([]);
  const [exportFindingIds, setExportFindingIds] = useState<string[]>([]);
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [investigationDraft, setInvestigationDraft] = useState({ name: '', description: '', startsAt: '', endsAt: '', searchConditions: '', isPublic: true });
  const [investigationSaving, setInvestigationSaving] = useState(false);
  const [adminIdentity, setAdminIdentity] = useState<{ id: string; userName: string; roles: string[] } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [investigationAdmins, setInvestigationAdmins] = useState<InvestigationAdmin[]>([]);
  const [adminUsernameToAdd, setAdminUsernameToAdd] = useState('');
  const [adminAccessError, setAdminAccessError] = useState('');

  const load = async () => {
    const response = await fetch(`${API}/investigations`);
    const data = response.ok ? await response.json() : [];
    setInvestigations(data);
    setInvestigationsLoaded(true);
  };
  useEffect(() => {
    void fetch(`${API}/auth/admin/me`).then(response => response.ok ? response.json() : null).then(identity => { setAdminIdentity(normalizeAdminIdentity(identity)); setAuthChecked(true); }).catch(() => setAuthChecked(true));
  }, []);
  useEffect(() => { if (authChecked && (route.kind !== 'investigation-list' || route.role !== 'admin' || adminIdentity)) void load(); }, [authChecked, route.kind, 'role' in route ? route.role : undefined, adminIdentity]);
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    if (route.kind !== 'investigation') { setSelected(null); setError(''); return; }
    if (!investigationsLoaded) return;
    let cancelled = false;
    const known = investigations.find(item => item.id === route.id);
    if (known) {
      if (route.role === 'user' && !['Planned', 'Active'].includes(known.status)) { setSelected(null); setError('Sökinsatsen är inte tillgänglig i användarläget.'); return; }
      setError(''); setSelected(known); return;
    }
    if (route.role !== 'user') { setSelected(null); setError('Sökinsatsen kunde inte hittas. Kontrollera länken.'); return; }
    void fetch(`${API}/investigations/${route.id}`).then(response => {
      if (response.status === 401) return { id: route.id, name: 'Privat sökinsats', status: 'Planned', isPublic: false } as Investigation;
      if (!response.ok) throw new Error('Sökinsatsen kunde inte hittas. Kontrollera länken.');
      return response.json() as Promise<Investigation>;
    }).then(investigation => { if (!cancelled) { setError(''); setSelected(investigation); } }).catch(cause => { if (!cancelled) { setSelected(null); setError(cause instanceof Error ? cause.message : 'Sökinsatsen kunde inte hittas.'); } });
    return () => { cancelled = true; };
  }, [route, investigations, investigationsLoaded]);
  const loadSelectedData = async (investigation: Investigation) => {
    const [sectorResponse, trackResponse, referencePointResponse, mapResponse, findingResponse] = await Promise.all([
      fetch(`${API}/investigations/${investigation.id}/sectors`),
      fetch(`${API}/investigations/${investigation.id}/tracks.geojson`),
      fetch(`${API}/investigations/${investigation.id}/reference-points`),
      fetch(`${API}/investigations/${investigation.id}/maps`),
      fetch(`${API}/investigations/${investigation.id}/findings`),
    ]);
    const loadedSectors = sectorResponse.ok ? await sectorResponse.json() : [];
    const trackCollection = trackResponse.ok ? await trackResponse.json() : { features: [] };
    const loadedReferencePoints = referencePointResponse.ok ? await referencePointResponse.json() : [];
    const loadedMaps = mapResponse.ok ? await mapResponse.json() : [];
    const loadedFindings = findingResponse.ok ? await findingResponse.json() : [];
    const loadedTracks = (trackCollection.features ?? []).filter((feature: any) => feature?.geometry?.type === 'LineString' && Array.isArray(feature.geometry.coordinates)).map((feature: any) => ({
      id: String(feature.id),
      callsign: feature.properties?.callsign,
      sourceFile: feature.properties?.sourceFile,
      geometry: feature.geometry,
    })) as Track[];
    setSectors(loadedSectors.map((sector: Sector) => {
      const geometryType = sector.geometry?.type ?? (sector.geometry?.coordinates?.length === 2 ? 'LineString' : 'Polygon');
      return { ...sector, geometry: { ...sector.geometry, type: geometryType }, ...(geometryType === 'LineString' ? { lengthKm: sector.areaKm2 ?? 0 } : {}) };
    }));
    setSectorDrafts(Object.fromEntries(loadedSectors.map((sector: Sector) => [sector.id, { name: sector.name, searched: sector.searched, searchedAt: sector.searchedAt ?? null, points: sector.points, showName: sector.showName, showArea: sector.showArea, poa: sector.poa ?? null }])));
    setTracks(loadedTracks);
    setFindings(loadedFindings);
    setReferencePoints(loadedReferencePoints);
    setOwnMaps(loadedMaps);
    setVisibleOwnMaps(Object.fromEntries(loadedMaps.map((map: InvestigationMap) => [map.id, true])));
    setVisibleTracks(Object.fromEntries(loadedTracks.map(track => [track.id, true])));
    setSelectedTrackId(null);
    setExpandedTrackId(null);
    setCheckedSectorIds([]);
  };
  useEffect(() => { setAccessCode(''); setInvestigationAdmins([]); setAdminUsernameToAdd(''); setAdminAccessError(''); setHiddenSectorIds({}); setInvalidSectorIds([]); setSectorsExpanded(true); setTracksExpanded(true); setSectorSearch(''); setExportSectorIds([]); setExportTrackIds([]); setExportFindingIds([]); setExportFrom(''); setExportTo(''); setOwnMaps([]); setVisibleOwnMaps({}); setFindingImages({}); if (selected) { setInvestigationDraft({ name: selected.name, description: selected.description ?? '', startsAt: toDateTimeLocal(selected.startsAt), endsAt: toDateTimeLocal(selected.endsAt), searchConditions: selected.searchConditions ?? '', isPublic: selected.isPublic !== false }); void loadSelectedData(selected); void loadInvestigationAdmins(selected.id); if (selected.isPublic === false) void loadAccessCode(selected.id); } else { setSectors([]); setReferencePoints([]); setSectorDrafts({}); setTracks([]); setFindings([]); setVisibleTracks({}); setEditor(null); setSelectedSectorId(null); setExpandedSectorId(null); } }, [selected]);
  useEffect(() => { document.getElementById('gpx-track-import')?.setAttribute('multiple', 'multiple'); }, [selected]);
  useEffect(() => { if (editor) setInvalidSectorIds(editor.getInvalidSectorIds()); }, [editor, sectors]);
  useEffect(() => {
    if (!saveConfirmation) return;
    const timeout = window.setTimeout(() => setSaveConfirmation(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveConfirmation]);
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
    if (!selectedSectorId) return;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.sector-card.selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [selectedSectorId]);
  useEffect(() => {
    if (!selectedTrackId) return;
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('.track-card.selected')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [selectedTrackId]);
  useEffect(() => {
    const onSectorCreated = (event: Event) => {
      const sector = (event as CustomEvent<Sector>).detail;
      if (sector) addPendingSector(sector);
    };
    const onSectorRemoved = (event: Event) => {
      const sectorId = (event as CustomEvent<string>).detail;
      if (!sectorId) return;
      setSectors(current => current.filter(sector => sector.id !== sectorId));
      setSectorDrafts(current => { const next = { ...current }; delete next[sectorId]; return next; });
      setSelectedSectorId(current => current === sectorId ? null : current);
      setExpandedSectorId(current => current === sectorId ? null : current);
    };
    window.addEventListener('efp:sector-created', onSectorCreated);
    window.addEventListener('efp:sector-removed', onSectorRemoved);
    const onFindingPlaced = (event: Event) => { const finding = (event as CustomEvent<{ latitude: number; longitude: number }>).detail; if (finding) addFindingAt(finding.latitude, finding.longitude); };
    window.addEventListener('efp:finding-placed', onFindingPlaced);
    return () => { window.removeEventListener('efp:sector-created', onSectorCreated); window.removeEventListener('efp:sector-removed', onSectorRemoved); window.removeEventListener('efp:finding-placed', onFindingPlaced); };
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
    setName(''); await load(); selectInvestigation(created, 'admin');
  };
  const go = (path: string) => navigateTo(path);
  const addFindingAt = (latitude: number, longitude: number) => {
    const id = `draft-finding-${Date.now()}`;
    setFindings(current => [{ id, submittedBy: adminIdentity?.userName ?? 'Admin', description: '', observedAt: new Date().toISOString(), submittedAt: new Date().toISOString(), imageUrl: '', longitude, latitude }, ...current]);
    setFindingImages(current => ({ ...current, [id]: null }));
  };
  const updateFinding = (id: string, patch: Partial<Finding>) => setFindings(current => current.map(finding => finding.id === id ? { ...finding, ...patch } : finding));
  const saveFinding = async (finding: Finding) => {
    if (!selected) return;
    const form = new FormData(); form.append('latitude', String(finding.latitude)); form.append('longitude', String(finding.longitude)); form.append('observedAt', new Date(finding.observedAt).toISOString()); form.append('description', finding.description ?? '');
    const image = findingImages[finding.id]; if (image) form.append('image', image);
    const isDraft = finding.id.startsWith('draft-');
    const response = await fetch(`${API}/investigations/${selected.id}/findings${isDraft ? '' : `/${finding.id}`}`, { method: isDraft ? 'POST' : 'PATCH', body: form });
    if (!response.ok) { setError((await response.text()) || 'Fyndet kunde inte sparas.'); return; }
    const saved = await response.json() as Finding;
    setFindings(current => current.map(item => item.id === finding.id ? saved : item));
    setFindingImages(current => { const next = { ...current }; delete next[finding.id]; return next; });
    setError('');
  };
  const selectInvestigation = (investigation: Investigation, role: AppRole) => {
    setSelected(investigation);
    go(investigationPath(role, investigation.id));
  };
  const saveInvestigation = async () => {
    if (!selected || !investigationDraft.name.trim()) return setError('Insatsens namn måste anges.');
    if (investigationDraft.startsAt && investigationDraft.endsAt && investigationDraft.endsAt < investigationDraft.startsAt) return setError('Sluttiden måste vara efter starttiden.');
    setInvestigationSaving(true); setError('');
    try {
      const response = await fetch(`${API}/investigations/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: investigationDraft.name.trim(), description: investigationDraft.description || null, startsAt: investigationDraft.startsAt ? new Date(investigationDraft.startsAt).toISOString() : null, endsAt: investigationDraft.endsAt ? new Date(investigationDraft.endsAt).toISOString() : null, searchConditions: investigationDraft.searchConditions || null, isPublic: investigationDraft.isPublic }) });
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
  const saveLatestSector = async () => {
    if (!selected) return setError('Välj en sökinsats först.');
    const coordinates = editor?.latestPolygon();
    if (!coordinates) return setError('Rita eller välj en polygon/fyrkant först.');
    const response = await fetch(`${API}/investigations/${selected.id}/sectors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Sektor ${sectors.length + 1}`, status: 'NotStarted', searchMethod: 'Patrol', priority: sectors.length + 1, geometry: { coordinates } }) });
    if (!response.ok) return setError(await response.text());
    setSectors(await fetch(`${API}/investigations/${selected.id}/sectors`).then(r => r.json()));
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
  const importSectorGpx = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    setError('');
    const form = new FormData(); form.append('file', file);
    const response = await fetch(`${API}/investigations/${selected.id}/sectors/import`, { method: 'POST', body: form });
    if (!response.ok) { setError(await response.text()); return; }
    await loadSelectedData(selected);
  };
  const saveMapChanges = async () => {
    if (!editor) return;
    setError('');
    setSaveConfirmation(false);
    try {
      await editor.save();
      await loadSelectedData(selected!);
      setSaveConfirmation(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kunde inte spara kartändringarna.');
    }
  };
  const discardMapChanges = async () => {
    if (!selected) return;
    editor?.discard();
    await loadSelectedData(selected);
    setActiveTool('none');
    setSelectedSectorId(null);
    setExpandedSectorId(null);
    setError('');
  };
  const updateSectorDraft = (sectorId: string, details: Partial<SectorDetails>) => {
    setSectorDrafts(current => ({ ...current, [sectorId]: { ...current[sectorId], ...details } }));
    editor?.updateSectorDetails(sectorId, { ...sectorDrafts[sectorId], ...details });
  };
  const deleteSector = async (sector: Sector) => {
    if (!selected || !window.confirm(`Är du säker på att du vill radera sektorn "${sector.name}"?`)) return;
    setError('');
    if (sector.id.startsWith('draft-')) {
      editor?.removeSector(sector.id);
      setSectors(current => current.filter(item => item.id !== sector.id));
      setSectorDrafts(current => { const next = { ...current }; delete next[sector.id]; return next; });
      if (selectedSectorId === sector.id) setSelectedSectorId(null);
      if (expandedSectorId === sector.id) setExpandedSectorId(null);
      return;
    }
    const response = await fetch(`${API}/investigations/${selected.id}/sectors/${sector.id}`, { method: 'DELETE' });
    if (!response.ok) { setError((await response.text()) || `Kunde inte radera sektorn (HTTP ${response.status}).`); return; }
    if (selectedSectorId === sector.id) setSelectedSectorId(null);
    if (expandedSectorId === sector.id) setExpandedSectorId(null);
    await loadSelectedData(selected);
  };
  const loadAccessCode = async (investigationId: string) => {
    const response = await fetch(`${API}/investigations/${investigationId}/access-code`);
    if (!response.ok) return;
    const result = await response.json() as { code?: string };
    setAccessCode(result.code ?? '');
  };
  const rotateAccessCode = async () => {
    if (!selected) return;
    const response = await fetch(`${API}/investigations/${selected.id}/access-code/rotate`, { method: 'POST' });
    if (!response.ok) { setError((await response.text()) || 'Kunde inte skapa insatskod.'); return; }
    setAccessCode((await response.json()).code);
  };
  const loadInvestigationAdmins = async (investigationId: string) => {
    const response = await fetch(`${API}/investigations/${investigationId}/admins`);
    if (response.ok) setInvestigationAdmins(await response.json());
  };
  const addInvestigationAdmin = async () => {
    if (!selected || !adminUsernameToAdd.trim()) return;
    setAdminAccessError('');
    const response = await fetch(`${API}/investigations/${selected.id}/admins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: adminUsernameToAdd.trim() }) });
    if (!response.ok) { setAdminAccessError((await response.text()) || 'Admin-kontot kunde inte läggas till.'); return; }
    setAdminUsernameToAdd('');
    await loadInvestigationAdmins(selected.id);
  };
  const removeInvestigationAdmin = async (admin: InvestigationAdmin) => {
    if (!selected || admin.isOwner) return;
    if (!window.confirm(`Ta bort ${admin.username} från insatsen?`)) return;
    const response = await fetch(`${API}/investigations/${selected.id}/admins/${admin.id}`, { method: 'DELETE' });
    if (!response.ok) { setAdminAccessError((await response.text()) || 'Admin-kontot kunde inte tas bort.'); return; }
    await loadInvestigationAdmins(selected.id);
  };
  const uploadOwnMap = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    const bounds = Object.fromEntries(Object.entries(mapBounds).map(([key, value]) => [key, Number(value)])) as Record<string, number>;
    if (Object.values(bounds).some(value => !Number.isFinite(value))) return setError('Ange alla fyra koordinatgränser för kartan.');
    const form = new FormData(); form.append('file', file);
    Object.entries(bounds).forEach(([key, value]) => form.append(key, String(value)));
    setError('');
    const response = await fetch(`${API}/investigations/${selected.id}/maps`, { method: 'POST', body: form });
    if (!response.ok) return setError((await response.text()) || 'Kunde inte ladda upp kartan.');
    setMapBounds({ west: '', south: '', east: '', north: '' });
    await loadSelectedData(selected);
  };
  const deleteOwnMap = async (map: InvestigationMap) => {
    if (!selected || !window.confirm(`Är du säker på att du vill radera kartan "${map.name}"?`)) return;
    const response = await fetch(`${API}/investigations/${selected.id}/maps/${map.id}`, { method: 'DELETE' });
    if (!response.ok) return setError((await response.text()) || 'Kunde inte radera kartan.');
    await loadSelectedData(selected);
  };
  const deleteSelectedSectors = async () => {
    if (!selected) return;
    const targets = sectors.filter(sector => checkedSectorIds.includes(sector.id));
    if (targets.length === 0) return;
    if (!window.confirm(`Är du säker på att du vill radera ${targets.length} valda sektorer?`)) return;
    setError('');
    targets.filter(sector => sector.id.startsWith('draft-')).forEach(sector => editor?.removeSector(sector.id));
    try {
      for (const sector of targets.filter(item => !item.id.startsWith('draft-'))) {
        const response = await fetch(`${API}/investigations/${selected.id}/sectors/${sector.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error(`${sector.name}: ${(await response.text()) || `HTTP ${response.status}`}`);
      }
      await loadSelectedData(selected);
      setCheckedSectorIds([]);
      setSelectedSectorId(current => current && checkedSectorIds.includes(current) ? null : current);
      setExpandedSectorId(current => current && checkedSectorIds.includes(current) ? null : current);
    } catch (cause) {
      await loadSelectedData(selected);
      setCheckedSectorIds([]);
      setError(cause instanceof Error ? `Kunde inte radera alla valda sektorer: ${cause.message}` : 'Kunde inte radera alla valda sektorer.');
    }
  };
  const toggleSectorVisibility = (sectorId: string) => setHiddenSectorIds(current => ({ ...current, [sectorId]: !current[sectorId] }));
  const selectSector = (sectorId: string) => { setSelectedSectorId(sectorId); setExpandedSectorId(sectorId); };
  const addPendingSector = (sector: Sector) => {
    setSectors(current => current.some(item => item.id === sector.id)
      ? current.map(item => item.id === sector.id ? sector : item)
      : [...current, sector]);
    setSectorDrafts(current => ({ ...current, [sector.id]: { name: sector.name, searched: sector.searched, searchedAt: sector.searchedAt ?? null, points: sector.points, showName: sector.showName, showArea: sector.showArea, poa: sector.poa ?? null } }));
    setSelectedSectorId(sector.id);
    setExpandedSectorId(sector.id);
  };

  const chooseTool = (tool: ActiveTool, action: () => void) => { if (activeTool === tool) { setActiveTool('none'); editor?.stop(); return; } setActiveTool(tool); action(); };
  const mapLayers: Record<MapType, { url: string; attribution: string }> = {
    osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
    topographic: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: 'Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap' },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  };
  const selectedMapLayer = mapLayers[mapType];
  const matchingSectors = filterSectorsByName(sectors, sectorSearch, Object.fromEntries(Object.entries(sectorDrafts).map(([id, draft]) => [id, draft.name])));
  const visibleSectorIds = matchingSectors.map(sector => sector.id);
  const selectedSectorCount = sectors.filter(sector => checkedSectorIds.includes(sector.id)).length;
  const allVisibleSectorsChecked = visibleSectorIds.length > 0 && visibleSectorIds.every(sectorId => checkedSectorIds.includes(sectorId));
  const toggleAllVisibleSectors = () => setCheckedSectorIds(current => allVisibleSectorsChecked
    ? current.filter(sectorId => !visibleSectorIds.includes(sectorId))
    : Array.from(new Set([...current, ...visibleSectorIds])));
  const invalidSectorIdSet = new Set([...invalidSectorIds, ...sectors.filter(isInvalidSector).map(sector => sector.id)]);
  const exportSelection: ExportSelection = {
    sectorIds: exportSectorIds,
    trackIds: exportTrackIds,
    findingIds: exportFindingIds,
    from: exportFrom ? new Date(exportFrom).toISOString() : undefined,
    to: exportTo ? new Date(exportTo).toISOString() : undefined,
  };
  const nextSectorName = () => {
    const names = new Set(sectors.map(sector => (sectorDrafts[sector.id]?.name ?? sector.name).trim().toLocaleLowerCase()));
    let number = 1;
    while (names.has(`sektor ${number}`)) number += 1;
    return `Sektor ${number}`;
  };
  const updateTrackPod = async (track: Track, value: string) => {
    if (!selected) return;
    const pod = value === '' ? null : Number(value);
    if (pod !== null && (!Number.isFinite(pod) || pod < 0 || pod > 100)) return setError('POD måste vara mellan 0 och 100.');
    const response = await fetch(`${API}/investigations/${selected.id}/tracks/${track.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pod }) });
    if (!response.ok) return setError((await response.text()) || 'Kunde inte spara POD.');
    setTracks(current => current.map(item => item.id === track.id ? { ...item, pod } : item));
  };
  const removeInvalidSectors = () => {
    if (invalidSectorIdSet.size === 0 || !editor) return;
    if (!window.confirm(`Är du säker på att du vill radera ${invalidSectorIdSet.size} ogiltiga sektorer?`)) return;
    invalidSectorIdSet.forEach(sectorId => editor.removeSector(sectorId));
    setSectors(current => current.filter(sector => !invalidSectorIdSet.has(sector.id)));
    setSectorDrafts(current => Object.fromEntries(Object.entries(current).filter(([sectorId]) => !invalidSectorIdSet.has(sectorId))));
    setHiddenSectorIds(current => Object.fromEntries(Object.entries(current).filter(([sectorId]) => !invalidSectorIdSet.has(sectorId))));
    setInvalidSectorIds([]);
    setSelectedSectorId(null);
    setExpandedSectorId(null);
  };

  if (route.kind === 'not-found') return <RouteNotFound onHome={() => go('/')} />;
  if (route.kind === 'role-picker') return <RolePicker onSelect={role => go(`/${role}`)} />;
  if (route.kind === 'superadmin-system' && authChecked && !adminIdentity) return <AdminAuthView onAuthenticated={identity => { setAdminIdentity(normalizeAdminIdentity(identity)); }} onBack={() => go('/')} />;
  if (route.kind === 'superadmin-system') return <SuperadminSystemView onBack={() => go('/admin')} />;
  if ('role' in route && route.role === 'admin' && authChecked && !adminIdentity) return <AdminAuthView onAuthenticated={identity => { setAdminIdentity(normalizeAdminIdentity(identity)); void load(); }} onBack={() => go('/')} />;
  if (!selected) {
    const visibleInvestigations = route.role === 'user' ? investigations.filter(item => ['Planned', 'Active'].includes(item.status)) : investigations;
    return <InvestigationPicker role={route.role} investigations={visibleInvestigations} name={name} error={error} onNameChange={setName} onCreate={() => void createInvestigation()} onSelect={item => selectInvestigation(item, route.role)} onBack={() => go('/')} />;
  }
  if (route.role === 'user') return <UserInvestigationView investigation={selected} onBack={() => go('/user')} />;

  return <main className="app-shell">
    <header><h1>EFP sökledning</h1><span>Administratör · {adminIdentity?.userName}</span>{adminIdentity?.roles?.includes('Superadmin') && <button className="header-action" onClick={() => go('/admin/system')}>Systemöversikt</button>}<button className="header-action" onClick={() => { void fetch(`${API}/auth/admin/logout`, { method: 'POST' }); setAdminIdentity(null); setSelected(null); go('/'); }}>Logga ut</button></header>
    {error && <p className="error">{error}</p>}
    <InvestigationInlineSettingsV2 investigation={selected} draft={investigationDraft} saving={investigationSaving} onDraftChange={setInvestigationDraft} onSave={() => void saveInvestigation()} onStatusChange={status => void changeInvestigationStatus(status)} />
    <div className="layout">
      <aside className="investigation-sidebar">
        <button className="back-button" onClick={() => { if (!editor?.canUndo() || window.confirm('Du har osparade ändringar. Vill du lämna sidan utan att spara?')) { setSelected(null); go('/admin'); } }}>← Byt sökinsats</button>
        <section className="sidebar-section"><h3>Kartändringar</h3><button onClick={() => void saveMapChanges()}>{saveConfirmation ? '✓ Sparat' : '💾 Spara ändringar'}</button><button className="discard-button" onClick={() => void discardMapChanges()}>↶ Släng ändringar</button>{invalidSectorIdSet.size > 0 && <button className="danger-button invalid-sector-action" onClick={removeInvalidSectors}>⌫ Radera {invalidSectorIdSet.size} ogiltiga sektorer</button>}</section>
        {selected.isPublic === false && <section className="sidebar-section access-section"><h3>Anslutning</h3><p className="muted">Privat insats – kod krävs.</p><button type="button" onClick={() => void rotateAccessCode()}>Byt anslutningskod</button>{accessCode && <><strong className="access-code">{accessCode}</strong><small>Koden gäller tills den byts ut. Då ogiltigförklaras gamla användarsessioner.</small><button type="button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/user/investigations/${selected.id}?code=${accessCode}`)}>Kopiera anslutningslänk</button></>}</section>}
        <details className="sidebar-section collapsible-sidebar-section"><summary>Insatsadmins</summary><div className="collapsible-sidebar-content"><p className="muted">Admins som kan se och hantera denna insats.</p><ul className="admin-members-list">{investigationAdmins.map(admin => <li key={admin.id}><span>{admin.username}{admin.isOwner ? ' (ägare)' : ''}</span>{!admin.isOwner && <button type="button" className="danger-button" onClick={() => void removeInvestigationAdmin(admin)}>Ta bort</button>}</li>)}</ul><div className="admin-member-add"><input value={adminUsernameToAdd} onChange={event => setAdminUsernameToAdd(event.target.value)} placeholder="Befintligt användarnamn" aria-label="Admin-användarnamn" /><button type="button" onClick={() => void addInvestigationAdmin()} disabled={!adminUsernameToAdd.trim()}>Lägg till Admin</button></div>{adminAccessError && <p className="error">{adminAccessError}</p>}</div></details>
        <section className="sidebar-section sectors-section">
          <button className="sectors-section-toggle" onClick={() => setSectorsExpanded(current => !current)}><h3>Sektorer</h3><span aria-hidden="true">{sectorsExpanded ? '▾' : '▸'}</span></button>
          {sectorsExpanded && <><input className="sector-search" type="search" value={sectorSearch} onChange={event => setSectorSearch(event.target.value)} placeholder="Sök sektor-namn" aria-label="Sök sektor-namn" />
            {sectors.length > 0 && <div className="sector-bulk-actions"><button type="button" disabled={visibleSectorIds.length === 0} onClick={toggleAllVisibleSectors}>{allVisibleSectorsChecked ? 'Välj inga' : 'Välj alla'}</button><button type="button" className="danger-button" disabled={selectedSectorCount === 0} onClick={() => void deleteSelectedSectors()}>Radera valda ({selectedSectorCount})</button></div>}
            <div className="sector-list">{sectors.length === 0 ? <p className="muted">Inga sektorer i sökinsatsen.</p> : matchingSectors.length === 0 ? <p className="muted">Inga sektorer matchar sökningen.</p> : matchingSectors.map(sector => {
              const draft = sectorDrafts[sector.id] ?? { name: sector.name, searched: sector.searched, searchedAt: sector.searchedAt ?? null, points: sector.points, showName: sector.showName, showArea: sector.showArea, poa: sector.poa ?? null };
              const expanded = expandedSectorId === sector.id; const hidden = hiddenSectorIds[sector.id] === true;
              const invalid = invalidSectorIdSet.has(sector.id) || isInvalidSector(sector);
              return <article className={`sector-card ${selectedSectorId === sector.id ? 'selected' : ''} ${invalid ? 'invalid' : ''}`} key={sector.id}><label className="sector-select-checkbox" title="Markera sektor"><input type="checkbox" checked={checkedSectorIds.includes(sector.id)} onChange={event => setCheckedSectorIds(current => event.target.checked ? [...current, sector.id] : current.filter(id => id !== sector.id))} /> <span className="sr-only">Markera {draft.name || 'sektor'}</span></label><button className="sector-card-header" onClick={() => { setSelectedSectorId(sector.id); setExpandedSectorId(expanded ? null : sector.id); }}><span>{draft.name || 'Namnlös sektor'}</span><span className="sector-card-status">{invalid ? 'Ogiltig geometri' : hidden ? 'Dold' : draft.searched ? 'Sökt' : 'Ej sökt'} · {draft.points} p</span><span aria-hidden="true">{expanded ? '▴' : '▾'}</span></button>
                {expanded && <div className="sector-card-body" onClick={event => event.stopPropagation()}><label>Namn<input value={draft.name} onChange={event => updateSectorDraft(sector.id, { name: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.searched} onChange={event => updateSectorDraft(sector.id, { searched: event.target.checked, searchedAt: event.target.checked ? draft.searchedAt ?? new Date().toISOString() : null })} /> Sökt</label><label>Sökt när<input type="datetime-local" disabled={!draft.searched} value={draft.searchedAt ? draft.searchedAt.slice(0, 16) : ''} onChange={event => updateSectorDraft(sector.id, { searchedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label><label>POA (%)<input type="number" min="0" max="100" step="0.1" value={draft.poa ?? ''} onChange={event => updateSectorDraft(sector.id, { poa: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>Poäng<input type="number" min="0" value={draft.points} onChange={event => updateSectorDraft(sector.id, { points: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.showName} onChange={event => updateSectorDraft(sector.id, { showName: event.target.checked })} /> Visa namn i kartan</label><label className="checkbox-label"><input type="checkbox" checked={draft.showArea} onChange={event => updateSectorDraft(sector.id, { showArea: event.target.checked })} /> Visa storlek i km²</label><button className="simplify-button" onClick={() => editor?.simplifySector(sector.id, simplifyTolerance)}>Förenkla polygon</button><div className="sector-card-actions"><button onClick={() => toggleSectorVisibility(sector.id)}>{hidden ? 'Visa sektor i kartan' : 'Dölj sektor i kartan'}</button><button className="danger-button" onClick={() => void deleteSector(sector)}>Radera sektor</button></div></div>}</article>;
            })}</div></>}
        </section>
        <section className="sidebar-section tracks-section"><button type="button" className="tracks-section-toggle" aria-expanded={tracksExpanded} onClick={() => setTracksExpanded(current => !current)}><h3>Importerade spår</h3><span aria-hidden="true">{tracksExpanded ? '▾' : '▸'}</span></button>{tracksExpanded && <TrackList tracks={tracks} visibleTracks={visibleTracks} onVisibleChange={(trackId, visible) => setVisibleTracks(current => ({ ...current, [trackId]: visible }))} selectedTrackId={selectedTrackId} expandedTrackId={expandedTrackId} onSelect={setSelectedTrackId} onToggleExpanded={trackId => setExpandedTrackId(current => current === trackId ? null : trackId)} onUpdatePod={(track, value) => { void updateTrackPod(track, value); }} />}</section>
        <FindingList findings={findings} imageFiles={findingImages} onImageChange={(id, file) => setFindingImages(current => ({ ...current, [id]: file }))} onChange={updateFinding} onSave={finding => void saveFinding(finding)} />
        <details className="sidebar-section own-maps-section"><summary>Egna kartor</summary><div className="own-map-upload"><label>Västlig longitud<input type="number" step="any" value={mapBounds.west} onChange={event => setMapBounds(current => ({ ...current, west: event.target.value }))} /></label><label>Sydlig latitud<input type="number" step="any" value={mapBounds.south} onChange={event => setMapBounds(current => ({ ...current, south: event.target.value }))} /></label><label>Östlig longitud<input type="number" step="any" value={mapBounds.east} onChange={event => setMapBounds(current => ({ ...current, east: event.target.value }))} /></label><label>Nordlig latitud<input type="number" step="any" value={mapBounds.north} onChange={event => setMapBounds(current => ({ ...current, north: event.target.value }))} /></label><input id="own-map-upload" className="file-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={event => void uploadOwnMap(event)} /><label className="file-button" htmlFor="own-map-upload">Ladda upp kartbild</label></div>{ownMaps.length === 0 ? <p className="muted">Inga egna kartor uppladdade.</p> : <div className="own-map-list">{ownMaps.map(map => <div className="own-map-item" key={map.id}><label><input type="checkbox" checked={visibleOwnMaps[map.id] ?? true} onChange={event => setVisibleOwnMaps(current => ({ ...current, [map.id]: event.target.checked }))} /> {map.name}</label><button type="button" className="danger-button" onClick={() => void deleteOwnMap(map)}>Radera</button></div>)}</div>}</details>
        <ExportPanel sectors={sectors} tracks={tracks} findings={findings} selection={{ sectorIds: exportSectorIds, trackIds: exportTrackIds, findingIds: exportFindingIds, from: exportFrom, to: exportTo }} onSectorIdsChange={setExportSectorIds} onTrackIdsChange={setExportTrackIds} onFindingIdsChange={setExportFindingIds} onFromChange={setExportFrom} onToChange={setExportTo} getSectorUrl={format => format.sectors(API, selected.id, exportSelection)} getTrackUrl={format => format.tracks(API, selected.id, exportSelection)} getFindingUrl={format => format.findings(API, selected.id, exportSelection)} />
        <details className="sidebar-section import-section"><summary>Importera</summary><div className="import-links"><section><h3>Importera sektorer från GPX</h3><input id="gpx-sector-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importSectorGpx(event)} /><label className="file-button" htmlFor="gpx-sector-import">Välj sektor-GPX-fil</label></section><section><h3>Importera spår från GPX</h3><input id="gpx-track-import" className="file-input" type="file" accept=".gpx,application/gpx+xml" onChange={event => void importGpx(event)} /><label className="file-button" htmlFor="gpx-track-import">Välj spår-GPX-fil</label></section></div></details>
      </aside>
      <div className={`map map-cursor-${activeTool.toLowerCase()}`}><MapContainer key={selected.id} center={center} zoom={10} scrollWheelZoom><TileLayer attribution={selectedMapLayer.attribution} url={selectedMapLayer.url} />{ownMaps.filter(map => visibleOwnMaps[map.id] !== false).map(map => <ImageOverlay key={map.id} url={`${API.replace(/\/api\/v1$/, '')}${map.imageUrl}`} bounds={[[map.south, map.west], [map.north, map.east]]} opacity={0.8} />)}<TrackLayers tracks={tracks} visibleTracks={visibleTracks} selectedTrackId={selectedTrackId} onTrackSelect={trackId => { setSelectedTrackId(trackId); setExpandedTrackId(trackId); }} /><MapEditor investigationId={selected.id} color={color} strokeStyle={strokeStyle} sectors={sectors} nextSectorName={nextSectorName} activeTool={activeTool} onToolChange={setActiveTool} selectedSectorId={selectedSectorId} hiddenSectorIds={hiddenSectorIds} onSectorSelect={sectorId => { setSelectedSectorId(sectorId); setExpandedSectorId(sectorId); }} onReady={api => setEditor({ ...api })} /></MapContainer><div className="map-type-control"><label htmlFor="map-type">Karttyp</label><select id="map-type" value={mapType} onChange={event => setMapType(event.target.value as MapType)}><option value="osm">Standard</option><option value="topographic">Topografisk</option><option value="satellite">Satellit</option></select></div><div className="map-toolbar" aria-label="Ritverktyg"><button className={activeTool === 'Polygon' ? 'active' : ''} onClick={() => chooseTool('Polygon', () => editor?.draw('Polygon'))}>⬡ Polygon</button><button className={activeTool === 'Rectangle' ? 'active' : ''} onClick={() => chooseTool('Rectangle', () => editor?.draw('Rectangle'))}>▣ Polygon</button><button className={activeTool === 'Circle' ? 'active' : ''} onClick={() => chooseTool('Circle', () => editor?.draw('Circle'))}>◯ Cirkel</button><button className={activeTool === 'Line' ? 'active' : ''} onClick={() => chooseTool('Line', () => editor?.draw('Line'))}>╱ Sträcka</button><button className={activeTool === 'Text' ? 'active' : ''} onClick={() => chooseTool('Text', () => editor?.text())}>T Text</button><label>Färg <input className="color-input" type="color" value={color} onChange={event => setColor(event.target.value)} /></label><label>Linje <select value={strokeStyle} onChange={event => setStrokeStyle(event.target.value as StrokeStyle)}><option value="solid">Heldragen</option><option value="dash">Sträckad</option><option value="dot">Punktad</option><option value="dashdot">Sträck-punkt</option></select></label><button className={activeTool === 'Edit' ? 'active' : ''} onClick={() => chooseTool('Edit', () => editor?.edit())}>✎ Redigera</button><button className={activeTool === 'Drag' ? 'active' : ''} onClick={() => chooseTool('Drag', () => editor?.drag())}>✥ Flytta</button><button className={activeTool === 'Remove' ? 'active' : ''} onClick={() => chooseTool('Remove', () => editor?.remove())}>⌫ Ta bort</button><button disabled={!editor?.canUndo()} onClick={() => editor?.undo()}>↶ Ångra</button><button disabled={!editor?.canRedo()} onClick={() => editor?.redo()}>↷ Gör om</button></div></div>
    </div>
  </main>;
}

function RolePicker({ onSelect }: { onSelect: (role: AppRole) => void }) {
  return <main className="selection-screen role-selection">
    <header><h1>EFP sökledning</h1><span>Välj läge</span></header>
    <section className="role-picker">
      <h2>Hur vill du använda EFP?</h2>
      <button onClick={() => onSelect('admin')}><strong>Administratör</strong><small>Planera insatser, redigera sektorer och hantera underlag.</small></button>
      <button onClick={() => onSelect('user')}><strong>Användare</strong><small>Välj en aktiv insats och arbeta med underlag från extern GPS.</small></button>
    </section>
  </main>;
}

function InvestigationPicker({ role, investigations, name, error, onNameChange, onCreate, onSelect, onBack }: { role: AppRole; investigations: Investigation[]; name: string; error: string; onNameChange: (value: string) => void; onCreate: () => void; onSelect: (investigation: Investigation) => void; onBack: () => void }) {
  const isAdmin = role === 'admin';
  return <main className="selection-screen">
    <header><h1>EFP sökledning</h1><span>{isAdmin ? 'Administratör' : 'Användare'}</span></header>
    {error && <p className="error">{error}</p>}
    <section className="investigation-picker">
      <button className="selection-back" onClick={onBack}>← Byt läge</button>
      <h2>Välj sökinsats</h2>
      <p>{isAdmin ? 'Välj en befintlig sökinsats eller skapa en ny för att öppna karta och underlag.' : 'Välj en planerad eller aktiv sökinsats för att öppna användarläget.'}</p>
      {isAdmin && <div className="investigation-create"><input value={name} onChange={event => onNameChange(event.target.value)} placeholder="Namn på ny sökinsats" /><button onClick={onCreate}>Skapa sökinsats</button></div>}
      <div className="investigation-list">{investigations.length === 0 ? <p className="muted">Inga sökinsatser tillgängliga.</p> : investigations.map(item => <button onClick={() => onSelect(item)} key={item.id}>{item.name}<small>{investigationStatusLabel(item.status)}</small></button>)}</div>
    </section>
  </main>;
}

function RouteNotFound({ onHome }: { onHome: () => void }) {
  return <main className="selection-screen"><section className="investigation-picker"><h2>Sidan kunde inte hittas</h2><p>Kontrollera länken eller välj ett gränssnitt igen.</p><button onClick={onHome}>Till startsidan</button></section></main>;
}

type SystemOverview = { statistics: Record<string, number>; parameters: Record<string, unknown>; generatedAt: string };
type SystemAdmin = { id: string; userName: string; isActive: boolean; createdAt: string; isSuperadmin: boolean };
type SystemSession = { id: string; investigationId: string; callsign: string; createdAt: string; lastSeenAt: string; accessCodeVersion: number };

function SuperadminSystemView({ onBack }: { onBack: () => void }) {
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [admins, setAdmins] = useState<SystemAdmin[]>([]);
  const [sessions, setSessions] = useState<SystemSession[]>([]);
  const [error, setError] = useState('');
  const load = async () => {
    const [overviewResponse, adminsResponse, sessionsResponse] = await Promise.all([fetch(`${API}/admin/system`), fetch(`${API}/admin/users`), fetch(`${API}/admin/user-sessions`)]);
    if (!overviewResponse.ok || !adminsResponse.ok || !sessionsResponse.ok) { setError('Systemöversikten kunde inte laddas.'); return; }
    setOverview(await overviewResponse.json()); setAdmins(await adminsResponse.json()); setSessions(await sessionsResponse.json());
  };
  useEffect(() => { void load(); }, []);
  const setAdminActive = async (admin: SystemAdmin) => {
    if (admin.isSuperadmin) return;
    const response = await fetch(`${API}/admin/users/${admin.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !admin.isActive }) });
    if (response.ok) await load(); else setError('Admin-kontots status kunde inte ändras.');
  };
  const revokeSession = async (session: SystemSession) => {
    if (!window.confirm(`Återkalla sessionen för ${session.callsign}?`)) return;
    const response = await fetch(`${API}/admin/user-sessions/${session.id}`, { method: 'DELETE' });
    if (response.ok) await load(); else setError('Sessionen kunde inte återkallas.');
  };
  return <main className="selection-screen system-screen"><header><h1>EFP sökledning</h1><span>Superadmin · Systemöversikt</span></header><section className="system-panel"><button className="selection-back" onClick={onBack}>← Till insatser</button><h2>Systemöversikt</h2>{error && <p className="error">{error}</p>}{overview && <><section className="system-section"><h3>Statistik</h3><div className="system-stat-grid">{Object.entries(overview.statistics).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{systemStatisticLabel(key)}</span></div>)}</div></section><section className="system-section"><h3>Systemparametrar</h3><dl className="system-parameters">{Object.entries(overview.parameters).map(([key, value]) => <div key={key}><dt>{systemParameterLabel(key)}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section></>}{<section className="system-section"><h3>Admin-konton</h3><div className="system-table">{admins.map(admin => <div className="system-row" key={admin.id}><span><strong>{admin.userName}</strong><small>Skapad {new Date(admin.createdAt).toLocaleString('sv-SE')}</small></span>{admin.isSuperadmin ? <span className="protected-account">Superadmin · skyddat konto</span> : <button onClick={() => void setAdminActive(admin)}>{admin.isActive ? 'Inaktivera' : 'Aktivera'}</button>}</div>)}</div></section>}{<section className="system-section"><h3>Aktiva användarsessioner</h3>{sessions.length === 0 ? <p className="muted">Inga aktiva sessioner.</p> : <div className="system-table">{sessions.map(session => <div className="system-row" key={session.id}><span><strong>{session.callsign}</strong><small>{session.investigationId} · Senast använd {new Date(session.lastSeenAt).toLocaleString('sv-SE')}</small></span><button className="danger-button" onClick={() => void revokeSession(session)}>Återkalla</button></div>)}</div>}</section>}</section></main>;
}

function systemStatisticLabel(key: string) { return ({ investigations: 'Sökinsatser', activeInvestigations: 'Aktiva insatser', sectors: 'Sektorer', tracks: 'Spår', referencePoints: 'Referenspunkter', activeUserSessions: 'Aktiva användarsessioner', administrators: 'Administratörskonton' } as Record<string, string>)[key] ?? key; }
function systemParameterLabel(key: string) { return ({ apiVersion: 'API-version', environment: 'Miljö', databaseProvider: 'Databas', authentication: 'Autentisering', userSessionExpiration: 'Sessionens utgång', publicUserAccess: 'Publik åtkomst', configuration: 'Konfiguration' } as Record<string, string>)[key] ?? key; }

function AdminAuthView({ onAuthenticated, onBack }: { onAuthenticated: (identity: { id: string; userName: string; roles: string[] }) => void; onBack: () => void }) {
  const [registerMode, setRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const response = await fetch(`${API}/auth/admin/${registerMode ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (!response.ok) { setError((await response.text()) || 'Autentiseringen misslyckades.'); return; }
    if (registerMode) { setRegisterMode(false); setError('Kontot skapades. Logga in för att fortsätta.'); return; }
    onAuthenticated(normalizeAdminIdentity(await response.json()) ?? { id: '', userName: username, roles: [] });
  };
  return <main className="selection-screen"><section className="investigation-picker auth-panel"><button className="selection-back" onClick={onBack}>← Till startsidan</button><h2>{registerMode ? 'Registrera Admin' : 'Logga in som Admin'}</h2><form onSubmit={event => void submit(event)}><label>Användarnamn<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label><label>Lösenord<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={registerMode ? 'new-password' : 'current-password'} required /></label>{error && <p className="error">{error}</p>}<button type="submit">{registerMode ? 'Registrera' : 'Logga in'}</button></form><button className="secondary-action" onClick={() => { setRegisterMode(current => !current); setError(''); }}>{registerMode ? 'Jag har redan ett konto' : 'Registrera nytt Admin-konto'}</button></section></main>;
}

type UploadItem = { id: string; file: File; status: 'queued' | 'uploading' | 'success' | 'error'; message?: string; trackId?: string };
type UploadedTrack = { id: string; sourceFile?: string; callsign: string; assignedGroup?: string; sectorId?: string; notes?: string; pod?: number | null; importedAt?: string; pointCount?: number };
type UserConnection = { token: string; callsign: string; investigationId: string };

function UserConnectView({ investigation, code, callsign, error, onCodeChange, onCallsignChange, onSubmit, onBack }: { investigation: Investigation; code: string; callsign: string; error: string; onCodeChange: (value: string) => void; onCallsignChange: (value: string) => void; onSubmit: (event: React.FormEvent) => void; onBack: () => void }) {
  const requiresCode = investigation.isPublic === false;
  return <main className="user-shell"><section className="user-panel auth-panel"><button className="back-button" onClick={onBack}>← Byt sökinsats</button><h2>Anslut till {investigation.name}</h2><p className="muted">Ange anropsnamn för att fortsätta. Anropsnamnet sparas tillsammans med uppladdade spår.</p><form onSubmit={onSubmit}><label>Anropsnamn<input value={callsign} onChange={event => onCallsignChange(event.target.value)} placeholder="Exempel: Alfa 1" required /></label>{(requiresCode || code) && <label>Insatskod<input value={code} onChange={event => onCodeChange(event.target.value.toUpperCase())} placeholder="Åtta tecken" minLength={8} maxLength={8} required={requiresCode} /></label>}{error && <p className="error">{error}</p>}<button type="submit">Anslut</button></form></section></main>;
}

function UserInvestigationView({ investigation, onBack }: { investigation: Investigation; onBack: () => void }) {
  const connectionKey = `efp.userConnection:${investigation.id}`;
  const [connection, setConnection] = useState<UserConnection | null>(null);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [connectionCode, setConnectionCode] = useState(new URLSearchParams(window.location.search).get('code') ?? '');
  const [connectionCallsign, setConnectionCallsign] = useState('');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [callsign, setCallsign] = useState('');
  const [pod, setPod] = useState('');
  const [assignedGroup, setAssignedGroup] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadHistory, setUploadHistory] = useState<UploadedTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const [findingImage, setFindingImage] = useState<File | null>(null);
  const [findingDescription, setFindingDescription] = useState('');
  const [findingObservedAt, setFindingObservedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [findingLatitude, setFindingLatitude] = useState('');
  const [findingLongitude, setFindingLongitude] = useState('');
  const [findingPositionMessage, setFindingPositionMessage] = useState('');
  useEffect(() => {
    const stored = localStorage.getItem(connectionKey);
    if (!stored) { setConnectionChecked(true); return; }
    try {
      const parsed = JSON.parse(stored) as UserConnection;
      void fetch(`${API}/auth/user/session`, { headers: { Authorization: `Bearer ${parsed.token}` } }).then(response => response.ok ? response.json() : null).then(session => {
        if (session) { setConnection({ ...parsed, callsign: session.callsign }); setConnectionCallsign(session.callsign); } else localStorage.removeItem(connectionKey);
        setConnectionChecked(true);
      }).catch(() => { localStorage.removeItem(connectionKey); setConnectionChecked(true); });
    } catch { localStorage.removeItem(connectionKey); setConnectionChecked(true); }
  }, [connectionKey]);
  const connect = async (event: React.FormEvent) => {
    event.preventDefault(); setConnectionError('');
    const response = await fetch(`${API}/auth/user/connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ investigationId: investigation.id, code: connectionCode.trim() || null, callsign: connectionCallsign.trim() }) });
    if (!response.ok) { setConnectionError((await response.text()) || 'Anslutningen misslyckades.'); return; }
    const result = await response.json() as UserConnection;
    const next = { token: result.token, callsign: result.callsign, investigationId: investigation.id };
    localStorage.setItem(connectionKey, JSON.stringify(next)); setConnection(next);
  };
  const disconnect = () => { localStorage.removeItem(connectionKey); setConnection(null); };
  useEffect(() => {
    if (!connection) return;
    let cancelled = false;
    void Promise.all([fetch(`${API}/investigations/${investigation.id}/sectors`, { headers: { Authorization: `Bearer ${connection.token}` } }), fetch(`${API}/investigations/${investigation.id}/findings`, { headers: { Authorization: `Bearer ${connection.token}` } })]).then(async ([sectorResponse, findingResponse]) => { const [sectorData, findingData] = await Promise.all([sectorResponse.ok ? sectorResponse.json() : [], findingResponse.ok ? findingResponse.json() : []]); if (!cancelled) { setSectors(sectorData); setFindings(findingData); setSelectedSectorIds(sectorData.map((sector: Sector) => sector.id)); } });
    return () => { cancelled = true; };
  }, [investigation.id, connection]);
  const useCurrentPosition = () => {
    if (!navigator.geolocation) { setFindingPositionMessage('Enheten stöder inte hämtning av position.'); return; }
    setFindingPositionMessage('Hämtar enhetens position…');
    navigator.geolocation.getCurrentPosition(position => {
      setFindingLatitude(position.coords.latitude.toFixed(7));
      setFindingLongitude(position.coords.longitude.toFixed(7));
      setFindingPositionMessage('Positionen hämtades från enheten.');
    }, error => setFindingPositionMessage(error.code === error.PERMISSION_DENIED ? 'Åtkomst till position nekades.' : 'Enhetens position kunde inte hämtas.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  };
  const submitFinding = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!connection || !findingImage || !findingLatitude || !findingLongitude) { setUploadMessage('Bild och position måste anges för fyndet.'); return; }
    const form = new FormData(); form.append('image', findingImage); form.append('latitude', findingLatitude); form.append('longitude', findingLongitude); form.append('observedAt', new Date(findingObservedAt).toISOString()); if (findingDescription.trim()) form.append('description', findingDescription.trim());
    const response = await fetch(`${API}/investigations/${investigation.id}/findings`, { method: 'POST', headers: { Authorization: `Bearer ${connection.token}` }, body: form });
    if (!response.ok) { setUploadMessage((await response.text()) || 'Fyndet kunde inte skickas.'); return; }
    const finding = await response.json() as Finding; setFindings(current => [finding, ...current]); setFindingImage(null); setFindingDescription(''); setUploadMessage('Fyndet skickades.');
  };
  useEffect(() => {
    if (!connection?.callsign) { setUploadHistory([]); return; }
    let cancelled = false;
    void fetch(`${API}/investigations/${investigation.id}/tracks?callsign=${encodeURIComponent(connection.callsign)}`, { headers: { Authorization: `Bearer ${connection.token}` } })
      .then(response => response.ok ? response.json() : [])
      .then(data => { if (!cancelled) setUploadHistory(data); })
      .catch(() => { if (!cancelled) setUploadHistory([]); });
    return () => { cancelled = true; };
  }, [investigation.id, connection]);
  const updateUploadItem = (id: string, patch: Partial<UploadItem>) => setUploadItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  const uploadOne = async (item: UploadItem) => {
    if (!connection?.callsign) { updateUploadItem(item.id, { status: 'error', message: 'Anropsnamn måste anges.' }); return; }
    updateUploadItem(item.id, { status: 'uploading', message: undefined }); setUploading(true);
    try {
      const form = new FormData(); form.append('file', item.file); form.append('callsign', connection.callsign);
      if (pod) form.append('pod', pod); if (assignedGroup.trim()) form.append('assignedGroup', assignedGroup.trim()); if (sectorId) form.append('sectorId', sectorId); if (notes.trim()) form.append('notes', notes.trim());
      const response = await fetch(`${API}/investigations/${investigation.id}/tracks/import`, { method: 'POST', headers: { Authorization: `Bearer ${connection?.token ?? ''}` }, body: form });
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      const result = await response.json();
      updateUploadItem(item.id, { status: 'success', trackId: result.id, message: 'Uppladdad.' });
      setUploadHistory(current => [result, ...current.filter(track => track.id !== result.id)]);
    } catch (cause) {
      updateUploadItem(item.id, { status: 'error', message: cause instanceof Error ? cause.message : 'Uppladdningen misslyckades.' });
    } finally { setUploading(false); }
  };
  const uploadTracks = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length === 0) return;
    if (!connection?.callsign) { setUploadMessage('Anropsnamn måste anges innan spår laddas upp.'); return; }
    const items: UploadItem[] = [];
    for (const file of files) { const validation = await validateTrackFile(file); items.push({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, status: validation.valid ? 'queued' : 'error', message: validation.valid ? undefined : validation.message }); }
    setUploadItems(items); setUploadMessage('');
    for (const item of items.filter(candidate => candidate.status === 'queued')) await uploadOne(item);
  };
  const allSectorIds = sectors.map(sector => sector.id);
  const allSectorsSelected = allSectorIds.length > 0 && selectedSectorIds.length === allSectorIds.length;
  const toggleAllSectors = () => setSelectedSectorIds(allSectorsSelected ? [] : allSectorIds);
  const toggleSector = (sectorId: string) => setSelectedSectorIds(current => current.includes(sectorId) ? current.filter(id => id !== sectorId) : [...current, sectorId]);
  const exportSelection: ExportSelection = { sectorIds: selectedSectorIds };
  const downloadSectorExport = async (format: ExportFormat) => {
    if (!connection || selectedSectorIds.length === 0) return;
    const response = await fetch(format.sectors(API, investigation.id, exportSelection), { headers: { Authorization: `Bearer ${connection.token}` } });
    if (!response.ok) { setUploadMessage('Exporten kunde inte hämtas.'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${investigation.name}-sektorer-${format.label.replaceAll(' ', '-').toLowerCase()}`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadTrackExport = async (format: ExportFormat) => {
    if (!connection || selectedSectorIds.length === 0) return;
    const response = await fetch(format.tracks(API, investigation.id, exportSelection), { headers: { Authorization: `Bearer ${connection.token}` } });
    if (!response.ok) { setUploadMessage('Spårexporten kunde inte hämtas.'); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${investigation.name}-spår-${format.label.replaceAll(' ', '-').toLowerCase()}`; link.click(); URL.revokeObjectURL(url);
  };
  const downloadFindingExport = async (format: ExportFormat) => {
    if (!connection || selectedSectorIds.length === 0) return;
    const response = await fetch(format.findings(API, investigation.id, exportSelection), { headers: { Authorization: `Bearer ${connection.token}` } });
    if (!response.ok) { setUploadMessage('Fyndexporten kunde inte hämtas.'); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${investigation.name}-fynd-${format.label.replaceAll(' ', '-').toLowerCase()}`; link.click(); URL.revokeObjectURL(url);
  };
  if (!connectionChecked) return <main className="user-shell"><section className="user-panel"><p>Laddar anslutning…</p></section></main>;
  if (!connection) return <UserConnectView investigation={investigation} code={connectionCode} callsign={connectionCallsign} error={connectionError} onCodeChange={setConnectionCode} onCallsignChange={setConnectionCallsign} onSubmit={connect} onBack={onBack} />;
  return <main className="user-shell">
    <header><h1>EFP sökledning</h1><span>Användarläge</span></header>
    <section className="user-panel">
      <button className="back-button" onClick={onBack}>← Byt sökinsats</button><button type="button" className="secondary-action" onClick={disconnect}>Koppla från insats</button>
      <h2>{investigation.name}</h2>
      <p className="muted">{investigation.description || 'Planerade och aktiva sektorer för extern GPS-användning.'}</p>
      <section className="user-section"><div className="user-section-heading"><h3>Sektorer</h3>{sectors.length > 0 && <button type="button" onClick={toggleAllSectors}>{allSectorsSelected ? 'Välj inga' : 'Välj alla'}</button>}</div>{sectors.length === 0 ? <p className="muted">Inga sektorer i sökinsatsen.</p> : <ul className="user-sector-list">{sectors.map(sector => <li key={sector.id}><label><input type="checkbox" checked={selectedSectorIds.includes(sector.id)} onChange={() => toggleSector(sector.id)} /><span>{sector.name || 'Namnlös sektor'}</span></label><small>{investigationStatusLabel(sector.status)}</small></li>)}</ul>}<p className="muted selection-count">{selectedSectorIds.length} av {sectors.length} sektorer valda.</p><div className="user-export-group"><strong>Hämta valda sektorer</strong><div className="user-export-links">{exportFormats.map(format => <a className={selectedSectorIds.length === 0 ? 'disabled-link' : ''} aria-disabled={selectedSectorIds.length === 0} key={`sector-${format.label}`} href="#" onClick={event => { event.preventDefault(); void downloadSectorExport(format); }}>{format.label}</a>)}</div></div><div className="user-export-group"><strong>Hämta spår som intersectar valda sektorer</strong><p className="muted">Hela spåret hämtas även om det fortsätter utanför sektorerna.</p><div className="user-export-links">{exportFormats.map(format => <a className={selectedSectorIds.length === 0 ? 'disabled-link' : ''} aria-disabled={selectedSectorIds.length === 0} key={`track-${format.label}`} href="#" onClick={event => { event.preventDefault(); void downloadTrackExport(format); }}>{format.label}</a>)}</div></div></section>
      <section className="user-section"><h3>Ladda upp spår från extern GPS</h3><label>Anropsnamn<input value={callsign} onChange={event => setCallsign(event.target.value)} placeholder="Exempel: Alfa 1" required /></label><label>POD (%)<input type="number" min="0" max="100" step="0.1" value={pod} onChange={event => setPod(event.target.value)} placeholder="Inte angivet" /></label><label>Patrull/grupp<input value={assignedGroup} onChange={event => setAssignedGroup(event.target.value)} placeholder="Exempel: Alfa 1" /></label><label>Sektor<select value={sectorId} onChange={event => setSectorId(event.target.value)}><option value="">Ingen sektor vald</option>{sectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label><label>Anteckning<textarea value={notes} onChange={event => setNotes(event.target.value)} rows={3} /></label><input id="user-track-upload" className="file-input" type="file" accept=".gpx,application/gpx+xml" multiple onChange={event => void uploadTracks(event)} /><label className="file-button" htmlFor="user-track-upload">{uploading ? 'Laddar upp…' : 'Välj spårfiler'}</label>{uploadMessage && <p className="upload-message">{uploadMessage}</p>}{uploadItems.length > 0 && <ul className="upload-status-list">{uploadItems.map(item => <li key={item.id}><span>{item.file.name}</span><small className={`upload-status-${item.status}`}>{item.message || (item.status === 'uploading' ? 'Laddar upp…' : 'Väntar…')}</small>{item.status === 'error' && <button type="button" onClick={() => void uploadOne(item)}>Försök igen</button>}</li>)}</ul>}</section>
      <section className="user-section"><h3>Mina uppladdningar</h3>{uploadHistory.length === 0 ? <p className="muted">Inga uppladdningar hittades för anropsnamnet.</p> : <ul className="upload-history-list">{uploadHistory.map(track => <li key={track.id}><strong>{track.sourceFile || 'GPX-spår'}</strong><span>{track.assignedGroup || 'Ingen grupp'} · {track.pod === null || track.pod === undefined ? 'POD ej angiven' : `POD ${track.pod}%`}</span>{track.notes && <small>{track.notes}</small>}</li>)}</ul>}</section>
      <section className="user-section"><h3>Skicka in fynd</h3><form onSubmit={event => void submitFinding(event)}><label>Bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setFindingImage(event.target.files?.[0] ?? null)} required /></label><div className="finding-position"><label>Latitud<input type="number" step="any" value={findingLatitude} onChange={event => setFindingLatitude(event.target.value)} required /></label><label>Longitud<input type="number" step="any" value={findingLongitude} onChange={event => setFindingLongitude(event.target.value)} required /></label><button type="button" onClick={useCurrentPosition}>Här</button><p className="finding-position-message">{findingPositionMessage}</p></div><label>Tidpunkt<input type="datetime-local" value={findingObservedAt} onChange={event => setFindingObservedAt(event.target.value)} required /></label><label>Beskrivning<textarea value={findingDescription} onChange={event => setFindingDescription(event.target.value)} rows={3} /></label><button type="submit">Skicka fynd</button></form></section>
      <section className="user-section"><h3>Fynd i valda sektorer</h3><div className="user-export-links">{exportFormats.map(format => <a className={selectedSectorIds.length === 0 ? 'disabled-link' : ''} aria-disabled={selectedSectorIds.length === 0} key={`finding-${format.label}`} href="#" onClick={event => { event.preventDefault(); void downloadFindingExport(format); }}>{format.label}</a>)}</div></section>
      <p className="muted user-scope-note">Användarläget visar endast planerade och aktiva insatser. QR-/kodanslutning införs i nästa steg.</p>
    </section>
  </main>;
}

type ExportPanelProps = {
  sectors: Sector[];
  tracks: Track[];
  findings: Finding[];
  selection: { sectorIds: string[]; trackIds: string[]; findingIds: string[]; from: string; to: string };
  onSectorIdsChange: (ids: string[]) => void;
  onTrackIdsChange: (ids: string[]) => void;
  onFindingIdsChange: (ids: string[]) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  getSectorUrl: (format: ExportFormat) => string;
  getTrackUrl: (format: ExportFormat) => string;
  getFindingUrl: (format: ExportFormat) => string;
};

function ExportPanel({ sectors, tracks, findings, selection, onSectorIdsChange, onTrackIdsChange, onFindingIdsChange, onFromChange, onToChange, getSectorUrl, getTrackUrl, getFindingUrl }: ExportPanelProps) {
  const allSectorIds = sectors.map(sector => sector.id);
  const allTrackIds = tracks.map(track => track.id);
  const allFindingIds = findings.map(finding => finding.id);
  const toggle = (id: string, checked: boolean, selectedIds: string[], allIds: string[], onChange: (ids: string[]) => void) => {
    if (checked) {
      if (selectedIds.length > 0 && !selectedIds.includes(id)) onChange([...selectedIds, id]);
      return;
    }
    onChange(selectedIds.length === 0 ? allIds.filter(item => item !== id) : selectedIds.filter(item => item !== id));
  };
  return <details className="sidebar-section export-section"><summary>Exportera</summary>
    <div className="export-selection">
      <p className="muted">Lämna urvalet tomt för att exportera alla.</p>
      <fieldset><legend>Sektorer</legend>
        {sectors.length === 0 ? <span className="muted">Inga sektorer.</span> : sectors.map(sector => <label key={sector.id} className="export-checkbox"><input type="checkbox" checked={selection.sectorIds.length === 0 || selection.sectorIds.includes(sector.id)} onChange={event => toggle(sector.id, event.target.checked, selection.sectorIds, allSectorIds, onSectorIdsChange)} /> {sector.name || 'Namnlös sektor'}</label>)}
      </fieldset>
      <fieldset><legend>Spår</legend>
        {tracks.length === 0 ? <span className="muted">Inga spår.</span> : tracks.map(track => <label key={track.id} className="export-checkbox"><input type="checkbox" checked={selection.trackIds.length === 0 || selection.trackIds.includes(track.id)} onChange={event => toggle(track.id, event.target.checked, selection.trackIds, allTrackIds, onTrackIdsChange)} /> {track.sourceFile ?? track.callsign ?? 'GPX-import'}</label>)}
      </fieldset>
      <fieldset><legend>Fynd</legend>
        {findings.length === 0 ? <span className="muted">Inga fynd.</span> : findings.map(finding => <label key={finding.id} className="export-checkbox"><input type="checkbox" checked={selection.findingIds.length === 0 || selection.findingIds.includes(finding.id)} onChange={event => toggle(finding.id, event.target.checked, selection.findingIds, allFindingIds, onFindingIdsChange)} /> {finding.submittedBy} · {formatDateTime(finding.observedAt)}</label>)}
      </fieldset>
      <fieldset><legend>Tidsintervall för spår</legend><div className="export-period"><label>Från<input type="datetime-local" value={selection.from} onChange={event => onFromChange(event.target.value)} /></label><label>Till<input type="datetime-local" value={selection.to} onChange={event => onToChange(event.target.value)} /></label></div><span className="muted">Spår utan tidsstämplar tas inte med när intervall anges.</span></fieldset>
    </div>
    <div className="export-links"><strong>Sektorer</strong>{exportFormats.map(format => <a key={`sector-${format.label}`} href={getSectorUrl(format)}>{format.label}</a>)}<strong>Spår</strong>{exportFormats.map(format => <a key={`track-${format.label}`} href={getTrackUrl(format)}>{format.label}</a>)}<strong>Fynd</strong>{exportFormats.map(format => <a key={`finding-${format.label}`} href={getFindingUrl(format)}>{format.label}</a>)}</div>
  </details>;
}

type InvestigationDraft = { name: string; description: string; startsAt: string; endsAt: string; searchConditions: string; isPublic: boolean };

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
  return createPortal(<><section className="sidebar-section investigation-settings-v2"><h3>Insats <InvestigationEditButton editing={editing} onClick={beginEditing} /></h3>{editing ? <><label className="stacked-setting">Namn<input autoFocus value={draft.name} onChange={event => update({ name: event.target.value })} /></label><label className="stacked-setting">Status<select value={investigation.status} onChange={event => onStatusChange(event.target.value)}><option value="Planned">Planerad</option><option value="Active">Aktiv</option><option value="Paused">Pausad</option><option value="Closed">Avslutad</option><option value="Archived">Arkiverad</option></select></label><label className="stacked-setting">Synlighet<select value={draft.isPublic ? 'public' : 'private'} onChange={event => update({ isPublic: event.target.value === 'public' })}><option value="public">Publik</option><option value="private">Privat</option></select></label><label className="stacked-setting">Beskrivning<textarea value={draft.description} onChange={event => update({ description: event.target.value })} rows={3} /></label><label className="stacked-setting">Starttid<input type="datetime-local" value={draft.startsAt} onChange={event => update({ startsAt: event.target.value })} /></label><label className="stacked-setting">Sluttid<input type="datetime-local" value={draft.endsAt} onChange={event => update({ endsAt: event.target.value })} /></label><label className="stacked-setting">Sökförutsättningar<textarea value={draft.searchConditions} onChange={event => update({ searchConditions: event.target.value })} rows={4} /></label><div className="inline-edit-actions"><button type="button" onClick={save} disabled={saving}>Spara</button><button type="button" className="cancel-inline-edit" onClick={cancel}>Avbryt</button></div></> : <>{viewField('Namn', draft.name, 'investigation-name')}{viewField('Status', investigationStatusLabel(investigation.status))}{viewField('Synlighet', draft.isPublic ? 'Publik' : 'Privat')}{viewField('Beskrivning', draft.description, 'investigation-description')}{viewField('Starttid', formatDateTime(draft.startsAt))}{viewField('Sluttid', formatDateTime(draft.endsAt))}{viewField('Sökförutsättningar', draft.searchConditions, 'investigation-description')}</>}</section>{investigation.status !== 'Archived' && <button className="discard-button archive-investigation" onClick={() => onStatusChange('Archived')} disabled={saving}>🗄 Arkivera sökinsats</button>}</>, target);
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

function FindingPlacement({ enabled }: { enabled: boolean }) {
  useMapEvents({ click: event => { if (enabled) { window.dispatchEvent(new CustomEvent('efp:finding-placed', { detail: { latitude: event.latlng.lat, longitude: event.latlng.lng } })); } } });
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

function FindingLayers({ findings }: { findings: Finding[] }) {
  return <>{findings.map(finding => <CircleMarker key={finding.id} center={[finding.latitude, finding.longitude]} radius={8} pathOptions={{ color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.9 }}><Popup><strong>Fynd</strong><br />{finding.submittedBy}<br />{formatDateTime(finding.observedAt)}{finding.description && <><br />{finding.description}</>}</Popup></CircleMarker>)}</>;
}

function FindingList({ findings, imageFiles, onImageChange, onChange, onSave }: { findings: Finding[]; imageFiles: Record<string, File | null>; onImageChange: (id: string, file: File | null) => void; onChange: (id: string, patch: Partial<Finding>) => void; onSave: (finding: Finding) => void }) {
  return <details className="sidebar-section collapsible-sidebar-section"><summary>Fynd ({findings.length})</summary><div className="collapsible-sidebar-content">{findings.length === 0 ? <p className="muted">Inga fynd inskickade.</p> : findings.map(finding => <article className="finding-card" key={finding.id}><div className="finding-card-heading"><strong>{finding.submittedBy}</strong><span>{finding.id.startsWith('draft-') ? 'Nytt fynd' : formatDateTime(finding.submittedAt)}</span></div>{finding.imageUrl && <img className="finding-image" src={`${API.replace(/\/api\/v1$/, '')}${finding.imageUrl}`} alt="Bild för fyndet" />}{imageFiles[finding.id] && <small>{imageFiles[finding.id]?.name}</small>}<label>Bild<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => onImageChange(finding.id, event.target.files?.[0] ?? null)} /></label><label>Latitud<input type="number" step="any" value={finding.latitude} onChange={event => onChange(finding.id, { latitude: Number(event.target.value) })} /></label><label>Longitud<input type="number" step="any" value={finding.longitude} onChange={event => onChange(finding.id, { longitude: Number(event.target.value) })} /></label><label>Tidpunkt<input type="datetime-local" value={finding.observedAt.slice(0, 16)} onChange={event => onChange(finding.id, { observedAt: new Date(event.target.value).toISOString() })} /></label><label>Beskrivning<textarea rows={3} value={finding.description ?? ''} onChange={event => onChange(finding.id, { description: event.target.value })} /></label><button type="button" onClick={() => onSave(finding)}>Spara fynd</button></article>)}</div></details>;
}

function TrackLayers({ tracks, visibleTracks, selectedTrackId, onTrackSelect }: { tracks: Track[]; visibleTracks: Record<string, boolean>; selectedTrackId: string | null; onTrackSelect: (trackId: string) => void }) {
  const map = useMap();
  const trackLayers = useRef<Record<string, L.Layer>>({});
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    trackLayers.current = {};
    tracks.filter(track => visibleTracks[track.id] !== false).forEach(track => {
      const geometry = { ...track.geometry, coordinates: limitTrackCoordinates(track.geometry.coordinates) };
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry } as GeoJSON.Feature, { style: { color: track.id === selectedTrackId ? '#f59e0b' : '#7c3aed', weight: track.id === selectedTrackId ? 6 : 4, opacity: 0.85 } }).addTo(group);
      layer.on('click', () => onTrackSelect(track.id));
      trackLayers.current[track.id] = layer;
    });
    return () => { group.remove(); };
  }, [map, tracks, visibleTracks, selectedTrackId, onTrackSelect]);
  useEffect(() => {
    if (!selectedTrackId) return;
    const layer = trackLayers.current[selectedTrackId] as L.GeoJSON | undefined;
    const bounds = layer?.getBounds?.();
    if (bounds?.isValid?.()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16, animate: true });
  }, [map, selectedTrackId]);
  return null;
}

function limitTrackCoordinates(coordinates: number[][], maximum = 5000): number[][] {
  if (coordinates.length <= maximum) return coordinates;
  const step = (coordinates.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => coordinates[Math.round(index * step)]);
}

function MapEditor({ investigationId, color, strokeStyle, sectors, nextSectorName, activeTool, onToolChange, selectedSectorId, hiddenSectorIds, onSectorSelect, onReady }: { investigationId: string; color: string; strokeStyle: StrokeStyle; sectors: Sector[]; nextSectorName: () => string; activeTool: ActiveTool; onToolChange: (tool: ActiveTool) => void; selectedSectorId: string | null; hiddenSectorIds: Record<string, boolean>; onSectorSelect: (sectorId: string) => void; onReady: (api: EditorApi) => void }) {
  const map = useMap();
  const persistedSectorKey = JSON.stringify(sectors.filter(sector => !sector.id.startsWith('draft-')));
  const history = useRef<DrawingSnapshot[][]>([[]]);
  const historyIndex = useRef(0);
  const restoring = useRef(false);
  const textLayers = useRef<L.Marker[]>([]);
  const serverSectorLayers = useRef<any[]>([]);
  const initialServerSectorIds = useRef<string[]>([]);
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
  const [findingMode, setFindingMode] = useState(false);
  const [referencePoints, setReferencePoints] = useState<ReferencePoint[]>([]);
  const [mapFindings, setMapFindings] = useState<Finding[]>([]);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  useMapEvents({ click: event => { if (findingMode) { window.dispatchEvent(new CustomEvent('efp:finding-placed', { detail: { latitude: event.latlng.lat, longitude: event.latlng.lng } })); setFindingMode(false); onToolChange('none'); } } });
  useEffect(() => {
    const activateFinding = () => {
      drawingMode.current = false;
      textRemovalMode.current = false;
      editSelectionMode.current = false;
      splitSelectionMode.current = false;
      mergeSelectionMode.current = false;
      setTextMode(false);
      setReferencePointMode(null);
      setFindingMode(true);
    };
    window.addEventListener('efp:activate-finding', activateFinding);
    return () => window.removeEventListener('efp:activate-finding', activateFinding);
  }, []);
  const settings = useRef({ color, strokeStyle });
  const nextSectorNameRef = useRef(nextSectorName);
  settings.current = { color, strokeStyle };
  nextSectorNameRef.current = nextSectorName;
  useEffect(() => { setToolbarTarget(document.querySelector<HTMLElement>('.map-toolbar')); }, []);
  useEffect(() => {
    if (!toolbarTarget) return;
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '📍 Fynd'; button.setAttribute('aria-label', 'Placera fynd på kartan');
    button.onclick = () => { onToolChange('Finding'); window.dispatchEvent(new Event('efp:activate-finding')); };
    toolbarTarget.appendChild(button);
    return () => button.remove();
  }, [toolbarTarget, onToolChange]);
  useEffect(() => { void fetch(`${API}/investigations/${investigationId}/reference-points`).then(response => response.ok ? response.json() : []).then(setReferencePoints); }, [investigationId]);
  useEffect(() => { void fetch(`${API}/investigations/${investigationId}/findings`).then(response => response.ok ? response.json() : []).then(setMapFindings); }, [investigationId]);
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    mapFindings.forEach(finding => L.circleMarker([finding.latitude, finding.longitude], { radius: 8, color: '#dc2626', fillColor: '#f87171', fillOpacity: 0.9 }).bindTooltip(`Fynd från ${escapeHtml(finding.submittedBy)}<br>${formatDateTime(finding.observedAt)}`).addTo(group));
    return () => { group.remove(); };
  }, [map, mapFindings]);
  const geomanMap = map as L.Map & { pm?: any };
  const getLayers = () => geomanMap.pm?.getGeomanLayers?.() ?? [];
  const isSectorLayer = (layer: any) => Boolean(layer.__sectorId || layer.__sector);
  const styleFor = (layer: any) => ({ color: layer.options?.color ?? '#2563eb', weight: layer.options?.weight ?? 4, dashArray: layer.options?.dashArray });
  const snapshot = (): DrawingSnapshot[] => {
    const shapes = getLayers().filter(isSectorLayer).map((layer: any) => {
      const shape = layer instanceof L.Circle ? 'Circle' : layer.pm?.getShape?.() ?? layer.toGeoJSON().geometry.type;
      if (shape === 'Circle') return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, radius: layer.getRadius(), sectorId: layer.__sectorId, sector: layer.__sector, style: styleFor(layer) };
      return { kind: 'shape' as const, shape, geometry: layer.toGeoJSON().geometry, sectorId: layer.__sectorId, sector: layer.__sector, style: styleFor(layer) };
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
    const restoredDraftSectors: Sector[] = [];
    items.forEach(item => {
      if (item.kind === 'text' && item.text && item.lat !== undefined && item.lng !== undefined) { addTextLayer(item.text, item.lat, item.lng); return; }
      if (!item.geometry) return;
      const geometry = item.geometry as any; const coordinates = geometry.coordinates; const options = { ...item.style, fillColor: item.style?.color, fillOpacity: 0.15 }; let layer: any;
      if (item.shape === 'Circle') layer = L.circle([coordinates[1], coordinates[0]], { ...options, radius: item.radius ?? 20 }).addTo(map);
      else if (item.shape === 'Rectangle') layer = L.rectangle(toLatLngs(coordinates[0]), options).addTo(map);
      else if (item.shape === 'Line' || geometry.type === 'LineString') layer = L.polyline(toLatLngs(coordinates), options).addTo(map);
      else layer = L.polygon(toLatLngs(coordinates[0]), options).addTo(map);
      if (item.sectorId) layer.__sectorId = item.sectorId;
      if (item.sector) layer.__sector = item.sector;
      geomanMap.pm?.reInitLayer?.(layer);
      if (item.sector) {
        configureSectorLayer(layer);
        if (item.sector.id?.startsWith('draft-')) restoredDraftSectors.push(item.sector as Sector);
      }
    });
    restoring.current = false;
    restoredDraftSectors.forEach(sector => window.dispatchEvent(new CustomEvent<Sector>('efp:sector-created', { detail: sector })));
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
  const getSectorCoordinates = (layer: any): number[][] | null => {
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
  const updateSectorLabel = (layer: any) => {
    const sector = layer.__sector as Sector | undefined;
    if (!sector) return;
    const labels = [];
    if (sector.showName) labels.push(escapeHtml(sector.name));
    if (sector.geometry.type === 'LineString' && sector.showArea) labels.push(`${(sector.lengthKm ?? 0).toFixed(3)} km`);
    else if (sector.showArea) labels.push(`${(sector.areaKm2 ?? 0).toFixed(3)} km²`);
    if (labels.length === 0) layer.unbindTooltip?.();
    else layer.bindTooltip(labels.join('<br>'), { permanent: true, direction: 'center', className: 'sector-label' }).openTooltip();
  };
  const configureSectorLayer = (layer: any) => {
    layer.on('pm:edit pm:dragend', saveHistory);
    layer.on('pm:remove', saveHistory);
    layer.on('click', (event: any) => {
      if (drawingMode.current) {
        event.originalEvent?.stopPropagation?.();
        return;
      }
      if (layer.__sectorId && hiddenSectorIds[layer.__sectorId]) return;
      if (mergeSelectionMode.current) {
        event.originalEvent?.stopPropagation?.();
        if (!mergeFirst.current) {
          mergeFirst.current = layer;
          layer.setStyle({ color: '#f59e0b', weight: 6 });
          const sectorId = layer.__sectorId ?? layer.__sector?.id;
          if (sectorId) onSectorSelect(sectorId);
          return;
        }
        if (mergeFirst.current === layer) return;
        mergeSectorLayers(mergeFirst.current, layer);
        return;
      }
      if (splitSelectionMode.current) {
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        splitSelectionMode.current = false;
        splitTarget.current = layer;
        const sectorId = layer.__sectorId ?? layer.__sector?.id;
        if (sectorId) onSectorSelect(sectorId);
        layer.setStyle({ color: '#f59e0b', weight: 6 });
        // Starta inte Geoman på samma klick som väljer sektorn. Annars blir
        // sektorklicket samtidigt första punkten på delningslinjen.
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
      const sectorId = layer.__sectorId ?? layer.__sector?.id;
      if (sectorId) onSectorSelect(sectorId);
    });
    updateSectorLabel(layer);
  };
  const updateSectorDetails = (sectorId: string, details: SectorDetails) => {
    const layer = getLayers().find((candidate: any) => candidate.__sectorId === sectorId || candidate.__sector?.id === sectorId);
    if (!layer) return;
    layer.__sector = { ...layer.__sector, ...details };
    updateSectorLabel(layer);
    saveHistory();
  };
  const simplifySector = (sectorId: string, toleranceMeters: number) => {
    const layer = getLayers().find((candidate: any) => candidate.__sectorId === sectorId || candidate.__sector?.id === sectorId);
    if (!layer) return;
    const coordinates = getPolygonCoordinates(layer);
    if (!coordinates || coordinates.length < 5) return;
    const simplified = simplifyRing(coordinates, toleranceMeters);
    if (simplified.length >= coordinates.length) return;
    layer.setLatLngs([toLatLngs(simplified)]);
    layer.redraw?.();
    layer.__sector = { ...layer.__sector, areaKm2: calculateAreaKm2(simplified) };
    updateSectorLabel(layer);
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
  const mergeSectorLayers = (firstLayer: any, secondLayer: any) => {
    const firstFeature = firstLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    const secondFeature = secondLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
    if (!segmentsShareBoundary(firstFeature.geometry.coordinates[0], secondFeature.geometry.coordinates[0])) {
      window.alert('Sektorerna måste vara grannar och dela en gemensam kant.');
      return;
    }
    const merged = polygonUnion(featureCollection([firstFeature, secondFeature]) as any) as any;
    if (!merged || merged.geometry?.type !== 'Polygon') {
      window.alert('Sektorerna kunde inte kombineras till en sammanhängande sektor.');
      return;
    }
    const source = firstLayer.__sector as Sector;
    const coordinates = merged.geometry.coordinates[0] as number[][];
    const sector: Sector = { ...source, id: `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, name: `${source.name} + ${secondLayer.__sector?.name ?? 'sektor'}`, areaKm2: calculateAreaKm2(coordinates), geometry: { coordinates } };
    restoring.current = true;
    firstLayer.remove(); secondLayer.remove();
    const layer: any = L.polygon(toLatLngs(coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 }).addTo(map);
    layer.__sector = sector; layer.__sectorId = undefined;
    geomanMap.pm?.reInitLayer?.(layer);
    configureSectorLayer(layer);
    restoring.current = false;
    window.dispatchEvent(new CustomEvent<string>('efp:sector-removed', { detail: firstLayer.__sector?.id }));
    window.dispatchEvent(new CustomEvent<string>('efp:sector-removed', { detail: secondLayer.__sector?.id }));
    window.dispatchEvent(new CustomEvent<Sector>('efp:sector-created', { detail: sector }));
    mergeFirst.current = null;
    saveHistory();
    onToolChange('none');
  };
  const splitSectorWithLine = (lineLayer: any, sectorLayer: any) => {
    const polygon = sectorLayer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>;
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
    sectorLayer.setStyle({ color: '#dc2626', weight: 4 });
    splitTarget.current = null;
    if (polygons.length < 2) { window.alert('Linjen måste gå genom sektorn från kant till kant.'); onToolChange('none'); return; }
    restoring.current = true;
    sectorLayer.remove();
    const source = sectorLayer.__sector as Sector;
    const newSectors: Sector[] = [];
    polygons.forEach((feature: any, index: number) => {
      const coordinates = feature.geometry.coordinates[0] as number[][];
      const sector: Sector = { ...source, id: `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random()}`}`, name: `${source.name} ${String.fromCharCode(65 + index)}`, priority: source.priority + index, areaKm2: calculateAreaKm2(coordinates), geometry: { coordinates } };
      const layer: any = L.polygon(toLatLngs(coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 }).addTo(map);
      layer.__sector = sector;
      layer.__sectorId = undefined;
      geomanMap.pm?.reInitLayer?.(layer);
      configureSectorLayer(layer);
      newSectors.push(sector);
    });
    restoring.current = false;
    window.dispatchEvent(new CustomEvent<string>('efp:sector-removed', { detail: source.id }));
    newSectors.forEach(sector => window.dispatchEvent(new CustomEvent<Sector>('efp:sector-created', { detail: sector })));
    saveHistory();
    onToolChange('none');
  };
  const saveChanges = async () => {
    // Geoman can expose other map layers as well, including imported GPX
    // tracks. Only layers explicitly marked as sectors may participate in
    // sector persistence; tracks are immutable and are saved by the import
    // endpoint instead.
    const layers = getLayers().filter(isSectorLayer);
    const draftLayers = layers.filter((layer: any) => !layer.__sectorId && layer.__sector);
    const currentSectorIds = new Set<string>();
    const requests: { sectorName: string; request: Promise<Response> }[] = [];
    for (const layer of layers) {
      let coordinates = getSectorCoordinates(layer);
      if (!coordinates) continue;
      const geometryType = layer.__sector?.geometry?.type ?? (layer.toGeoJSON().geometry.type === 'LineString' ? 'LineString' : 'Polygon');
      const existing = layer.__sectorId ? layer.__sector as Sector | undefined : undefined;
      if (geometryType === 'Polygon') {
        const normalized = normalizePolygonCoordinates(coordinates);
        if (!normalized) throw new Error(`Sektorn "${existing?.name ?? layer.__sector?.name ?? 'Namnlös sektor'}" har en ogiltig polygon. Kontrollera eller radera sektorn innan du sparar.`);
        coordinates = normalized;
      }
      if (existing) {
        currentSectorIds.add(existing.id);
        requests.push({ sectorName: existing.name, request: fetch(`${API}/investigations/${investigationId}/sectors/${existing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: existing.name, status: existing.status, searchMethod: 'Patrol', priority: existing.priority, searched: existing.searched, searchedAt: existing.searchedAt, points: existing.points, showName: existing.showName, showArea: existing.showArea, poa: existing.poa ?? null, geometry: { type: geometryType, coordinates } }) }) });
      } else {
        const pending = layer.__sector as Partial<Sector> | undefined;
        const sectorName = pending?.name ?? `Sektor ${layers.length}`;
        requests.push({ sectorName, request: fetch(`${API}/investigations/${investigationId}/sectors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: sectorName, status: pending?.status ?? 'NotStarted', searchMethod: 'Patrol', priority: pending?.priority ?? layers.length, searched: pending?.searched ?? false, searchedAt: pending?.searchedAt ?? null, points: pending?.points ?? 0, showName: pending?.showName ?? false, showArea: pending?.showArea ?? false, poa: pending?.poa ?? null, geometry: { type: geometryType, coordinates } }) }) });
      }
    }
    for (const sectorId of initialServerSectorIds.current) {
      if (!currentSectorIds.has(sectorId)) requests.push({ sectorName: `ID ${sectorId}`, request: fetch(`${API}/investigations/${investigationId}/sectors/${sectorId}`, { method: 'DELETE' }) });
    }
    const responses = await Promise.all(requests.map(async item => ({ ...item, response: await item.request })));
    const failed = responses.find(item => !item.response.ok);
    if (failed) {
      const body = await failed.response.text();
      let detail = body || `HTTP ${failed.response.status}`;
      try {
        const problem = JSON.parse(body) as { detail?: string; title?: string; errors?: Record<string, string[]> };
        detail = problem.detail ?? problem.title ?? (Object.values(problem.errors ?? {}).flat().join(' ') || detail);
      } catch { /* Behåll råtext om svaret inte är JSON. */ }
      throw new Error(`Kunde inte spara sektorn "${failed.sectorName}": ${detail}`);
    }
    // Nya sektorer har först en lokal draft-geometri. När POST/PUT lyckats
    // laddar App om serverdata, så draft-lagren måste tas bort här för att
    // inte lämna kvar en blå spökgeometri utanför sektorlistan.
    restoring.current = true;
    draftLayers.forEach((layer: any) => layer.remove());
    restoring.current = false;
  };
  const discardChanges = () => { stop(); history.current = [history.current[0]]; historyIndex.current = 0; onReady(api); };
  const removeSector = (sectorId: string) => {
    const layer = getLayers().find((candidate: any) => candidate.__sector?.id === sectorId || candidate.__sectorId === sectorId);
    if (!layer) return;
    layer.remove();
    saveHistory();
  };
  const getInvalidSectorIds = () => getLayers().filter((layer: any) => {
    if (!layer.__sector) return false;
    const geometryType = layer.__sector.geometry?.type ?? layer.toGeoJSON().geometry.type;
    return geometryType === 'Polygon' && !normalizePolygonCoordinates(getSectorCoordinates(layer) ?? []);
  }).map((layer: any) => layer.__sector.id ?? layer.__sectorId).filter((id: unknown): id is string => typeof id === 'string');
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
  const stop = () => { drawingMode.current = false; textRemovalMode.current = false; editSelectionMode.current = false; splitSelectionMode.current = false; mergeSelectionMode.current = false; splitTarget.current?.setStyle?.({ color: '#dc2626', weight: 4 }); mergeFirst.current?.setStyle?.({ color: '#dc2626', weight: 4 }); splitTarget.current = null; mergeFirst.current = null; setTextMode(false); setReferencePointMode(null); setFindingMode(false); geomanMap.pm?.disableDraw?.(); geomanMap.pm?.disableGlobalEditMode?.(); geomanMap.pm?.disableGlobalDragMode?.(); geomanMap.pm?.disableGlobalRemovalMode?.(); editingLayer.current?.pm?.disable?.(); editingLayer.current = null; };
  const api: EditorApi = {
    draw: mode => { stop(); drawingMode.current = true; geomanMap.pm?.enableDraw?.(mode, { pathOptions: { color: settings.current.color, weight: 4, dashArray: strokeMap[settings.current.strokeStyle], fillColor: settings.current.color, fillOpacity: 0.15 } }); },
    text: () => { stop(); setTextMode(true); }, edit: () => { stop(); editSelectionMode.current = true; }, drag: () => { stop(); geomanMap.pm?.enableGlobalDragMode?.(); }, remove: () => { stop(); textRemovalMode.current = true; geomanMap.pm?.enableGlobalRemovalMode?.(); }, removeSector, getInvalidSectorIds, split: () => { stop(); splitSelectionMode.current = true; }, merge: () => { stop(); mergeSelectionMode.current = true; }, placeReferencePoint: type => { stop(); setReferencePointMode(type); }, placeFinding: () => { drawingMode.current = false; textRemovalMode.current = false; editSelectionMode.current = false; splitSelectionMode.current = false; mergeSelectionMode.current = false; setTextMode(false); setReferencePointMode(null); setFindingMode(true); }, stop, undo, redo, save: saveChanges, discard: discardChanges, updateSectorDetails, simplifySector, latestPolygon, canUndo: () => historyIndex.current > 0, canRedo: () => historyIndex.current < history.current.length - 1
  };
  const createSectorLayer = (sector: Sector) => sector.geometry.type === 'LineString'
    ? L.polyline(toLatLngs(sector.geometry.coordinates), { color: '#dc2626', weight: 4 })
    : L.polygon(toLatLngs(sector.geometry.coordinates), { color: '#dc2626', weight: 4, fillColor: '#dc2626', fillOpacity: 0.15 });
  useEffect(() => {
    if (!geomanMap.pm) return;
    geomanMap.pm.setGlobalOptions?.({ continueDrawing: false });
    const onCreate = (event: any) => {
      if (splitTarget.current && (event.layer.pm?.getShape?.() ?? event.layer.toGeoJSON().geometry.type) === 'Line') {
        splitSectorWithLine(event.layer, splitTarget.current);
        return;
      }
      drawingMode.current = false;
      event.layer.pm?.enable?.({ allowSelfIntersection: false }); event.layer.on('pm:edit pm:dragend', saveHistory); event.layer.on('pm:remove', saveHistory); saveHistory(); onToolChange('none');
    };
    const onRemove = () => saveHistory();
    const onNewPolygon = (event: any) => {
      const shape = event.layer.pm?.getShape?.() ?? event.layer.toGeoJSON().geometry.type;
      if (!['Polygon', 'Rectangle', 'Circle', 'Line', 'LineString'].includes(shape)) return;
      const coordinates = getSectorCoordinates(event.layer);
      if (!coordinates) return;
      const id = `draft-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const isLine = shape === 'Line' || shape === 'LineString';
      const sector: Sector = { id, name: nextSectorNameRef.current(), status: 'NotStarted', priority: sectors.length + 1, searched: false, searchedAt: null, points: 0, showName: false, showArea: false, poa: null, areaKm2: isLine ? 0 : calculateAreaKm2(coordinates), lengthKm: isLine ? calculateLineLengthKm(coordinates) : undefined, geometry: { type: isLine ? 'LineString' : 'Polygon', coordinates } };
      event.layer.__sector = sector;
      event.layer.__sectorId = undefined;
      configureSectorLayer(event.layer);
      window.dispatchEvent(new CustomEvent<Sector>('efp:sector-created', { detail: sector }));
      // pm:create sparar en historikpost innan sektormetadata har kopplats på lagret.
      // Spara därför en ny snapshot här så att undo kan återställa sektorn som sektor.
      saveHistory();
    };
    map.on('pm:create', onCreate); map.on('pm:create', onNewPolygon); map.on('pm:remove', onRemove); onReady(api);
    return () => { map.off('pm:create', onCreate); map.off('pm:create', onNewPolygon); map.off('pm:remove', onRemove); };
  }, [map]);
  useEffect(() => {
    if (!geomanMap.pm) return;
    const persistedSectors = sectors.filter(sector => !sector.id.startsWith('draft-'));
    serverSectorLayers.current.forEach(layer => layer.remove());
    serverSectorLayers.current = persistedSectors.map(sector => {
      const layer: any = createSectorLayer(sector).addTo(map);
      layer.__sectorId = sector.id; layer.__sector = sector; geomanMap.pm.reInitLayer?.(layer);
      configureSectorLayer(layer);
      return layer;
    });
    // Behåll originaluppsättningen under hela den lokala redigeringssessionen.
    // Annars försvinner ID:n för sektorer som tagits bort genom split/merge innan
    // saveChanges hinner skicka deras DELETE-anrop.
    if (!serverBaselineInitialized.current && persistedSectors.length > 0) {
      initialServerSectorIds.current = persistedSectors.map(sector => sector.id);
      serverBaselineInitialized.current = true;
    }
    if (serverSectorLayers.current.length > 0) {
      const sectorBounds = L.featureGroup(serverSectorLayers.current).getBounds();
      if (sectorBounds.isValid()) map.fitBounds(sectorBounds, { padding: [48, 48], maxZoom: 16, animate: false });
    }
    history.current = [snapshot()]; historyIndex.current = 0; onReady(api);
  }, [map, persistedSectorKey]);
  useEffect(() => {
    serverSectorLayers.current.forEach((layer: any) => {
      if (!layer.__sectorId) return;
      const selected = layer.__sectorId === selectedSectorId;
      const hidden = hiddenSectorIds[layer.__sectorId] === true;
      if (hidden) layer.remove?.();
      else if (!map.hasLayer(layer)) layer.addTo?.(map);
      layer.setStyle?.({ color: selected ? '#f59e0b' : '#dc2626', weight: selected ? 6 : 4, opacity: 1, fillOpacity: 0.15 });
    });
  }, [selectedSectorId, hiddenSectorIds, sectors]);
  useEffect(() => {
    if (!selectedSectorId) return;
    const layer = getLayers().find((candidate: any) => candidate.__sectorId === selectedSectorId || candidate.__sector?.id === selectedSectorId);
    const bounds = layer?.getBounds?.();
    if (bounds?.isValid?.()) map.panTo(bounds.getCenter(), { animate: true });
  }, [selectedSectorId, sectors]);
  useEffect(() => {
    if (sectors.length > 0) return;
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
  }, [map, sectors.length]);
  return <><TextPlacement enabled={textMode} onPlace={(lat, lng) => { setTextMode(false); onToolChange('none'); const text = window.prompt('Text på kartan', '')?.trim(); if (text) addTextLayer(text, lat, lng); }} /><ReferencePointPlacement enabled={referencePointMode !== null} onPlace={(lat, lng) => { if (referencePointMode) void saveReferencePoint(referencePointMode, lat, lng); }} /> <ReferencePointLayers referencePoints={referencePoints} />{toolbarTarget && createPortal(<><button className={activeTool === 'Split' ? 'active' : ''} title="Välj en sektor och rita sedan en fri linje från kant till kant" aria-label="Dela sektor: välj en sektor och rita sedan en fri linje" onClick={() => { onToolChange('Split'); api.split(); }}>✂ Dela sektor</button><button className={activeTool === 'Merge' ? 'active' : ''} title="Välj två sektorer som delar en gemensam kant" aria-label="Slå ihop sektorer: välj två angränsande sektorer" onClick={() => { onToolChange('Merge'); api.merge(); }}>⇄ Slå ihop sektorer</button><button className={referencePointMode === 'Pls' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Pls'); }}>📍 PLS</button><button className={referencePointMode === 'Lkp' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Lkp'); }}>📍 LKP</button><button className={referencePointMode === 'Ipp' ? 'active' : ''} onClick={() => { onToolChange('none'); api.placeReferencePoint('Ipp'); }}>📍 IPP</button></>, toolbarTarget)}</>;
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
function normalizePolygonCoordinates(coordinates: number[][]): number[][] | null {
  const points = coordinates
    .filter(point => point.length >= 2 && point.every(value => Number.isFinite(value)))
    .map(([longitude, latitude]) => [longitude, latitude]);
  if (points.length < 3) return null;
  const first = points[0]; const last = points[points.length - 1];
  const closeEnough = Math.abs(first[0] - last[0]) <= 1e-7 && Math.abs(first[1] - last[1]) <= 1e-7;
  const openPoints = closeEnough ? points.slice(0, -1) : points;
  const uniquePoints = openPoints.filter((point, index) => !openPoints.slice(0, index).some(previous => Math.abs(previous[0] - point[0]) <= 1e-7 && Math.abs(previous[1] - point[1]) <= 1e-7));
  if (uniquePoints.length < 3) return null;
  const ring = [...uniquePoints, [...uniquePoints[0]]];
  const distinct = new Set(ring.slice(0, -1).map(([lng, lat]) => `${lng.toFixed(7)},${lat.toFixed(7)}`));
  if (distinct.size < 3) return null;
  const area = Math.abs(ring.slice(0, -1).reduce((sum, current, index) => {
    const next = ring[index + 1];
    return sum + current[0] * next[1] - next[0] * current[1];
  }, 0));
  if (area <= 1e-12 || polygonSelfIntersects(ring)) return null;
  return ring;
}
function isInvalidSector(sector: Sector): boolean {
  const geometryType = sector.geometry.type ?? 'Polygon';
  return geometryType === 'Polygon' && normalizePolygonCoordinates(sector.geometry.coordinates) === null;
}
function polygonSelfIntersects(ring: number[][]): boolean {
  const segmentCount = ring.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      if (second === first + 1 || (first === 0 && second === segmentCount - 1)) continue;
      if (segmentsIntersect(ring[first], ring[first + 1], ring[second], ring[second + 1])) return true;
    }
  }
  return false;
}
function segmentsIntersect(firstStart: number[], firstEnd: number[], secondStart: number[], secondEnd: number[]): boolean {
  const orientation = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const onSegment = (a: number[], b: number[], c: number[]) => Math.min(a[0], c[0]) - 1e-10 <= b[0] && b[0] <= Math.max(a[0], c[0]) + 1e-10 && Math.min(a[1], c[1]) - 1e-10 <= b[1] && b[1] <= Math.max(a[1], c[1]) + 1e-10;
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);
  if (((first > 1e-10 && second < -1e-10) || (first < -1e-10 && second > 1e-10)) && ((third > 1e-10 && fourth < -1e-10) || (third < -1e-10 && fourth > 1e-10))) return true;
  return (Math.abs(first) <= 1e-10 && onSegment(firstStart, secondStart, firstEnd)) || (Math.abs(second) <= 1e-10 && onSegment(firstStart, secondEnd, firstEnd)) || (Math.abs(third) <= 1e-10 && onSegment(secondStart, firstStart, secondEnd)) || (Math.abs(fourth) <= 1e-10 && onSegment(secondStart, firstEnd, secondEnd));
}
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
