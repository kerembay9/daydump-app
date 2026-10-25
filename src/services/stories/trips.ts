import { PhotoAsset } from '../../types';
import { haversineKm, Place } from '../index/cityLookup';

export type Trip = { photos: PhotoAsset[]; place: string; country: string; start: number; end: number; days: number; homeCity: string };

const DAY = 86_400_000;
const AWAY_KM = 80;
const MAX_GAP = 36 * 3_600_000;
export const MIN_TRIP_PHOTOS = 6;

const dayKey = (t: number) => new Date(t).toDateString();

/**
 * Trips = runs of geotagged photos far (>80 km) from home, split on >36 h gaps or any photo back home.
 * Home = the city with the most distinct photo days.
 */
export function findTrips(photos: PhotoAsset[], placeFor: (lat: number, lon: number) => Place | null): Trip[] {
  const geo = photos
    .filter((p) => p.location)
    .sort((a, b) => a.creationTime - b.creationTime)
    .map((p) => ({ p, place: placeFor(p.location!.latitude, p.location!.longitude) }))
    .filter((x): x is { p: PhotoAsset; place: Place } => !!x.place);
  if (!geo.length) return [];

  const daysPerCity = new Map<string, Set<string>>();
  for (const { p, place } of geo) {
    const k = `${place.city}|${place.countryCode}`;
    (daysPerCity.get(k) ?? daysPerCity.set(k, new Set()).get(k)!).add(dayKey(p.creationTime));
  }
  const homeKey = [...daysPerCity].sort((a, b) => b[1].size - a[1].size)[0][0];
  const home = geo.find((g) => `${g.place.city}|${g.place.countryCode}` === homeKey)!.place;

  const trips: Trip[] = [];
  let run: typeof geo = [];
  const flush = () => {
    if (run.length >= MIN_TRIP_PHOTOS) trips.push(toTrip(run, home.city));
    run = [];
  };
  for (const g of geo) {
    const away = haversineKm(home.lat, home.lon, g.p.location!.latitude, g.p.location!.longitude) > AWAY_KM;
    if (!away) { flush(); continue; }
    if (run.length && g.p.creationTime - run[run.length - 1].p.creationTime > MAX_GAP) flush();
    run.push(g);
  }
  flush();
  return trips;
}

function toTrip(run: { p: PhotoAsset; place: Place }[], homeCity: string): Trip {
  const byCity = new Map<string, number>();
  const countries = new Set<string>();
  for (const { place } of run) {
    byCity.set(place.city, (byCity.get(place.city) ?? 0) + 1);
    countries.add(place.country);
  }
  const ranked = [...byCity].sort((a, b) => b[1] - a[1]);
  // Several cities, none dominant, one country -> name the country ("A week in Japan").
  const multi = ranked.length > 2 && ranked[0][1] / run.length < 0.6 && countries.size === 1;
  const start = run[0].p.creationTime, end = run[run.length - 1].p.creationTime;
  return {
    photos: run.map((r) => r.p),
    place: multi ? [...countries][0] : ranked[0][0],
    country: [...countries][0],
    start, end,
    days: new Set(run.map((r) => dayKey(r.p.creationTime))).size,
    homeCity,
  };
}

export function tripTitle(t: Trip): string {
  const spanDays = Math.round((t.end - t.start) / DAY) + 1;
  const weekendish = spanDays <= 3 && [0, 5, 6].includes(new Date(t.start).getDay());
  if (spanDays <= 1) return `A day in ${t.place}`;
  if (weekendish) return `A weekend in ${t.place}`;
  if (spanDays >= 5 && spanDays <= 9) return `A week in ${t.place}`;
  return `${spanDays} days in ${t.place}`;
}
