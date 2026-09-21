export type ZoneNameValue = { id: string; name: string };

export function filterZonesByName<T extends ZoneNameValue>(zones: T[], query: string, draftNames: Record<string, string> = {}): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return zones;
  return zones.filter(zone => (draftNames[zone.id] ?? zone.name).toLocaleLowerCase().includes(normalizedQuery));
}
