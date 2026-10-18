// Offline reverse geocoding. Data: GeoNames cities15000 (CC BY 4.0, geonames.org), built by scripts/build_assets.py.
type CityRow = [name: string, cc: string, lat: number, lon: number, pop: number];
export type Place = { city: string; country: string; countryCode: string; lat: number; lon: number; km: number };

let grid: Map<string, CityRow[]> | null = null;
let countries: Record<string, string> = {};

function load() {
  if (grid) return grid;
  const data = require('./cities.json') as { countries: Record<string, string>; cities: CityRow[] };
  countries = data.countries;
  grid = new Map();
  for (const c of data.cities) {
    const k = `${Math.floor(c[2])},${Math.floor(c[3])}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(c);
  }
  return grid;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/**
 * Nearest city, but the most populous 100k+ city within 30 km wins, so districts roll up to the city people say they visited.
 * ponytail: 1° grid, no antimeridian wrap; null if nothing within ~1°.
 */
export function placeFor(lat: number, lon: number): Place | null {
  const g = load();
  let best: CityRow | null = null, bestKm = Infinity, big: CityRow | null = null, bigKm = Infinity;
  const la = Math.floor(lat), lo = Math.floor(lon);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const c of g.get(`${la + i},${lo + j}`) ?? []) {
        const km = haversineKm(lat, lon, c[2], c[3]);
        if (km < bestKm) { best = c; bestKm = km; }
        if (c[4] >= 100_000 && km < 30 && c[4] > (big?.[4] ?? 0)) { big = c; bigKm = km; }
      }
  const c = big ?? best;
  if (!c) return null;
  return { city: c[0], countryCode: c[1], country: countries[c[1]] ?? c[1], lat: c[2], lon: c[3], km: big ? bigKm : bestKm };
}
