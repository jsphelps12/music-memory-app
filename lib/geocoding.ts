export interface GeoResult {
  name: string;
  lat: number | null;
  lng: number | null;
}

function buildDisplayName(address: Record<string, string>): string {
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet;
  const region = address.state || address.region || address.county;
  const country = address.country;
  const parts = [city, region || country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : country || "";
}

export async function searchPlaces(query: string): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=5&addressdetails=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Soundtracks/1.0 (soundtracks.app)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await res.json();
    return (json as any[])
      .map((item) => ({
        name: buildDisplayName(item.address),
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }))
      .filter((r) => r.name);
  } catch {
    clearTimeout(timeout);
    return [];
  }
}
