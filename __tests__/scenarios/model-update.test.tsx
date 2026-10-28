import { screen } from 'expo-router/testing-library';
import * as SQLite from 'expo-sqlite';
import { bootApp } from '../../jest/app';
import { NAMES, seedWorld, world } from '../../jest/world';

const MODEL = (require('../../src/services/index/clipGolden.json') as { model: string }).model;
const OLD = 'TinyCLIP-auto-ViT-45M-32-Text-18M-LAIONYFCC400M';

beforeAll(() => seedWorld());

test('an update that ships a new CLIP model re-reads every photo, and the dumps come back', async () => {
  // The phone indexed the whole library with the previous model: its vectors are in another space.
  const open = SQLite.openDatabaseAsync;
  let d: Awaited<ReturnType<typeof open>> | undefined;
  jest.spyOn(SQLite, 'openDatabaseAsync').mockImplementationOnce(async (name: string) => {
    d = await open(name);
    await d.execAsync(`CREATE TABLE photos (id TEXT PRIMARY KEY, uri TEXT NOT NULL, created INTEGER NOT NULL, w INTEGER, h INTEGER,
      lat REAL, lon REAL, emb BLOB, concepts TEXT); CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT); PRAGMA user_version = ${NAMES.length}`);
    await d.runAsync("INSERT INTO meta (k, v) VALUES ('model', ?)", [OLD]);
    const stale = new Float32Array(512); stale[511] = 1;
    for (const p of world.photos) {
      await d.runAsync('INSERT INTO photos (id, uri, created, w, h, lat, lon, emb, concepts) VALUES (?,?,?,?,?,?,?,?,?)',
        [p.id, p.uri, p.created, p.w, p.h, p.lat ?? null, p.lon ?? null, new Uint8Array(stale.buffer), '[[],[]]']);
    }
    return d;
  });
  const clip = (globalThis as any).expo.modules.ClipEmbedder;
  const embed = jest.spyOn(clip, 'embedImages');

  await bootApp('/');
  expect(await screen.findByLabelText(/^A week in Seattle, /, {}, { timeout: 10000 })).toBeTruthy();

  expect(MODEL).not.toBe(OLD);
  expect((await d!.getFirstAsync<{ v: string }>("SELECT v FROM meta WHERE k = 'model'"))?.v).toBe(MODEL);
  const read = new Set(embed.mock.calls.flatMap((c) => c[0] as string[]));
  expect(world.photos.filter((p) => !read.has(p.uri))).toEqual([]);
}, 30000);
