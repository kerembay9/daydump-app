// Run the story engine on a phone's index, on the desktop, and score it against the eval manifest.
// 1. adb exec-out run-as com.horizonzeta.picdump cat files/SQLite/photo-index-eval.db > scripts/.cache/photo-index-eval.db
// 2. npx -y tsx scripts/stories_report.ts
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { placeFor } from '../src/services/index/cityLookup';
import type { IndexedPhoto } from '../src/services/index/photoIndex';
import { DEFAULT_TOPIC_OPTIONS, findTopics } from '../src/services/stories/topics';
import { findTrips, tripTitle } from '../src/services/stories/trips';
import { topicTitle } from '../src/services/stories/titles';

const C = 'scripts/.cache/';
const names: string[] = JSON.parse(readFileSync(process.env.VOCAB ?? 'modules/clip-embedder/android/src/main/assets/clip/vocab.json', 'utf8')).names;
const manifest = JSON.parse(readFileSync(C + 'eval_manifest.json', 'utf8'));
const why = new Map<string, string>(manifest.photos.map((p: { path: string; why: string }) => [p.path.split('/').pop(), p.why]));

const rows = new DatabaseSync(process.env.DB ?? C + 'photo-index-eval.db').prepare('SELECT * FROM photos ORDER BY created').all() as any[];
const photos: IndexedPhoto[] = rows.map((r) => {
  const [ids, scores] = r.concepts ? JSON.parse(r.concepts) : [[], []];
  return {
    id: r.id, uri: r.uri, creationTime: r.created, width: r.w, height: r.h, mediaType: 'photo',
    location: r.lat != null ? { latitude: r.lat, longitude: r.lon } : undefined, concepts: ids, conceptScores: scores,
  };
});
const file = (p: IndexedPhoto) => decodeURIComponent(p.uri.split('/').pop()!);
const label = (p: IndexedPhoto) => (why.get(file(p)) ?? 'extra').replace(/ ·.*/, '');

/** Which manifest groups a found story's photos came from, e.g. "trip 1 ×14, diverse ×2". */
function provenance(ps: IndexedPhoto[]) {
  const c = new Map<string, number>();
  ps.forEach((p) => c.set(label(p).replace(/^diverse.*/, 'diverse'), (c.get(label(p).replace(/^diverse.*/, 'diverse')) ?? 0) + 1));
  return [...c].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', ');
}

console.log(`${photos.length} photos, ${photos.filter((p) => p.location).length} geotagged, ${photos.filter((p) => p.concepts.length).length} with concepts\n`);
console.log('EXPECTED');
for (const e of manifest.expected) console.log('  ' + e);

console.log('\nTRIPS');
for (const t of findTrips(photos, placeFor)) console.log(`  ${tripTitle(t)}  (${t.photos.length})  <- ${provenance(t.photos as IndexedPhoto[])}`);

console.log('\nTOPICS');
for (const t of findTopics(photos, names, DEFAULT_TOPIC_OPTIONS))
  console.log(`  ${topicTitle(t)}  [${t.name}${t.related.length ? ' ~ ' + t.related.join(', ') : ''}] share ${t.share.toFixed(2)} score ${t.score.toFixed(2)}\n      <- ${provenance(t.photos)}`);

console.log('\nTOP CONCEPTS PER EXPECTED GROUP (what the vocab sees)');
const groups = new Map<string, IndexedPhoto[]>();
for (const p of photos) if (!label(p).startsWith('diverse')) (groups.get(label(p)) ?? groups.set(label(p), []).get(label(p))!).push(p);
for (const [g, ps] of groups) {
  const c = new Map<number, number>();
  ps.forEach((p) => p.concepts.slice(0, DEFAULT_TOPIC_OPTIONS.topK).forEach((id) => c.set(id, (c.get(id) ?? 0) + 1)));
  const top = [...c].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => `${names[id]} ${n}/${ps.length}`);
  console.log(`  ${g}: ${top.join(', ')}`);
}
