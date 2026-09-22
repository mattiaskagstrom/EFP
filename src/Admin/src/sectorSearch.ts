export type SectorNameValue = { id: string; name: string };

export function filterSectorsByName<T extends SectorNameValue>(sectors: T[], query: string, draftNames: Record<string, string> = {}): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return sectors;
  return sectors.filter(sector => (draftNames[sector.id] ?? sector.name).toLocaleLowerCase().includes(normalizedQuery));
}
