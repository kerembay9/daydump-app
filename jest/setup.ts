/// <reference types="jest" />
/// <reference types="node" />
// Native boundaries only: the CLIP/share module, the photo library, SQLite (node:sqlite in memory), Skia, and the
// file/image/clipboard natives a JS test can't reach. Screens, navigation, AppState and every service run for real.
/* eslint-disable @typescript-eslint/no-require-imports */
import { AppState } from 'react-native';
import { byUri, embed, photoVec, textVec, topConcepts, world, NAMES, bgRow } from './world';

const MODEL = (require('../src/services/index/clipGolden.json') as { model: string }).model;

// The ClipEmbedder native module (modules/clip-embedder): requireOptionalNativeModule reads globalThis.expo.modules.
const ready: ReturnType<typeof bgRow>['row'][] = [];
(globalThis as any).expo.modules.ClipEmbedder = {
  embedImages: async (uris: string[]) => embed(uris.map((u) => { const p = byUri(u); if (!p) throw new Error(`no photo ${u}`); return photoVec(p); })),
  embedTexts: async (texts: string[]) => embed(texts.map(textVec)),
  topConcepts: async (b64: string, k: number) => topConcepts(b64, k),
  conceptNames: async () => [...NAMES],
  scheduleBackgroundIndex: async () => {},
  cancelBackgroundIndex: async () => { world.bg.state = 'idle'; },
  pauseBackgroundIndex: async () => { world.bg.state = 'paused'; },
  resumeBackgroundIndex: async () => { world.bg.state = 'running'; },
  // A running worker finishes one photo per status poll (the first library photo, re-embedded: harmless).
  backgroundIndexStatus: async () => {
    const b = world.bg;
    if (b.state === 'running' && world.photos.length) ready.push(bgRow(world.photos[0], MODEL).row);
    return { ...b, charging: b.batteryPct == null, notify: true, canFast: false };
  },
  takeBackgroundResults: async () => ({ model: MODEL, rows: ready.splice(0) }),
  shareImages: async () => world.shareResult,
  getInitialShareIntent: () => world.initialShare,
  addListener: (_: string, cb: typeof world.shareListener) => { world.shareListener = cb; return { remove: () => { world.shareListener = null; } }; },
  setNavigationBarStyle: () => {},
  // the selfie finder: a scan that finds none
  wantModel: () => {}, holdIndexing: () => {}, warmSelfie: async () => {},
  faces: async () => [], selfieCheck: async () => ({ scans: [], vecs: '', reject: [], gateVecs: '', sharp: [] }),
};

// The app only indexes in the foreground (photoIndex hands off to the background worker otherwise).
Object.defineProperty(AppState, 'currentState', { get: () => 'active', configurable: true });
// Toasts: ToastAndroid.show is a jest.fn tests can read (toast()).
jest.mock('react-native/Libraries/Components/ToastAndroid/ToastAndroid', () => ({
  __esModule: true,
  default: { SHORT: 0, LONG: 1, TOP: 0, BOTTOM: 1, CENTER: 2, show: jest.fn(), showWithGravity: jest.fn(), showWithGravityAndOffset: jest.fn() },
}));

// Reanimated's jest mock (installed by expo-router/testing-library) needs the worklets one.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  const args = (p: unknown[]) => (Array.isArray(p[0]) ? p[0] : p).map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  return {
    openDatabaseAsync: async () => {
      const d = new DatabaseSync(':memory:');
      return {
        execAsync: async (sql: string) => { d.exec(sql); },
        runAsync: async (sql: string, ...p: unknown[]) => {
          const r = d.prepare(sql).run(...(args(p) as never[]));
          return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
        },
        getFirstAsync: async (sql: string, ...p: unknown[]) => d.prepare(sql).get(...(args(p) as never[])) ?? null,
        getAllAsync: async (sql: string, ...p: unknown[]) => d.prepare(sql).all(...(args(p) as never[])),
        withTransactionAsync: async (fn: () => Promise<void>) => {
          d.exec('BEGIN');
          try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
        },
      };
    },
  };
});

jest.mock('expo-media-library/legacy', () => {
  const { world: w, byId: find } = require('./world');
  const asset = (p: import('./world').FakePhoto) => ({
    id: p.id, uri: p.uri, filename: p.uri.split('/').pop(), creationTime: p.created, modificationTime: p.created,
    width: p.w, height: p.h, mediaType: 'photo', duration: 0,
  });
  const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never', accessPrivileges: 'all' };
  return {
    MediaType: { photo: 'photo', video: 'video', audio: 'audio', unknown: 'unknown' },
    SortBy: { creationTime: 'creationTime', modificationTime: 'modificationTime', default: 'default' },
    getAssetsAsync: async () => {
      const assets = [...w.photos].sort((a, b) => b.created - a.created).map(asset);
      return { assets, hasNextPage: false, endCursor: String(assets.length), totalCount: assets.length };
    },
    getAssetInfoAsync: async (id: string) => {
      const p = find(id);
      if (!p) throw new Error(`no asset ${id}`);
      return { ...asset(p), localUri: p.uri, location: p.lat != null ? { latitude: p.lat, longitude: p.lon } : undefined };
    },
    requestPermissionsAsync: jest.fn(async () => granted),
    getPermissionsAsync: jest.fn(async () => granted),
    getAlbumAsync: jest.fn(async () => null),
    createAlbumAsync: jest.fn(async (title: string) => ({ id: 'album', title, assetCount: 1 })),
    createAssetAsync: jest.fn(async (uri: string) => ({ id: `saved:${uri}`, uri })),
  };
});

// Skia: components render nothing; exports "draw" a fake JPEG.
jest.mock('@shopify/react-native-skia', () => {
  const Null = () => null;
  const img = () => ({ width: () => 1080, height: () => 1350, encodeToBytes: () => new Uint8Array([0xff, 0xd8]), dispose: () => {} });
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
  return {
    Canvas: Null, Group: Null, Image: Null, Rect: Null, RoundedRect: Null, Shadow: Null, ColorMatrix: Null, Path: Null,
    rect, rrect: (r: object, rx: number, ry: number) => ({ rect: r, rx, ry }), vec: (x: number, y: number) => ({ x, y }),
    Skia: { Image: { MakeImageFromEncoded: img }, Data: { fromURI: async () => ({}) } },
    drawAsImage: jest.fn(async () => img()),
    ImageFormat: { JPEG: 3, PNG: 4, WEBP: 6 },
  };
});

jest.mock('expo-image-manipulator', () => {
  const ref = { width: 3000, height: 4000, release: () => {}, saveAsync: async () => ({ uri: 'file:///cache/m.jpg', width: 1, height: 1 }) };
  const ctx = { resize: () => ctx, renderAsync: async () => ref };
  return { ImageManipulator: { manipulate: () => ctx }, SaveFormat: { JPEG: 'jpeg', PNG: 'png' } };
});

jest.mock('expo-file-system', () => {
  const join = (...p: unknown[]) => p.map((x) => (typeof x === 'string' ? x : (x as { uri: string }).uri)).join('/');
  class Directory { uri: string; exists = false; constructor(...p: unknown[]) { this.uri = join(...p); } create() {} delete() {} }
  class File { uri: string; exists = true; constructor(...p: unknown[]) { this.uri = join(...p); } write() {} delete() {} copy() {} }
  return { File, Directory, Paths: { cache: 'file:///cache', document: 'file:///doc' } };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true), getStringAsync: async () => '' }));

// Quiet: the app logs every index/story step.
jest.spyOn(console, 'log').mockImplementation(() => {});
