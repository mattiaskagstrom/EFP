export type TrackFileValidation = { valid: true } | { valid: false; message: string };

export async function validateTrackFile(file: File): Promise<TrackFileValidation> {
  if (!file.name.toLowerCase().endsWith('.gpx')) return { valid: false, message: 'Filen måste vara en GPX-fil.' };
  if (file.size === 0) return { valid: false, message: 'Filen är tom.' };
  if (file.size > 25 * 1024 * 1024) return { valid: false, message: 'Filen får vara högst 25 MB.' };
  try {
    const xml = typeof file.text === 'function'
      ? await file.text()
      : await new Response(file).text();
    if (!/<(?:[\w-]+:)?gpx(?:\s|>)/i.test(xml) || !/<\/(?:[\w-]+:)?gpx\s*>/i.test(xml)) return { valid: false, message: 'Filen innehåller ogiltig GPX/XML.' };
    const points = xml.match(/<(?:[\w-]+:)?trkpt(?:\s|>)/gi) ?? [];
    return points.length >= 2
      ? { valid: true }
      : { valid: false, message: 'GPX-filen måste innehålla minst två spårpunkter.' };
  } catch {
    return { valid: false, message: 'GPX-filen kunde inte läsas.' };
  }
}
