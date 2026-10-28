import type { TidyFace, TidyStats } from '../../../modules/clip-embedder';
import { isCameraPhoto, isScreenshot } from '../galleryService';
import { isSensitive, photoWorth, tagGroup } from '../stories/curate';
import { DIM } from '../index/vectors';

/** One photo as Tidy sees it: the unpruned listing, plus its CLIP tags and pixel checks. */
export type TPhoto = {
  id: string; uri: string; created: number; w: number; h: number; size: number; fav: boolean;
  concepts: number[]; conceptScores: number[];
  /** CLIP's "a sharp, in-focus photo" minus "a blurry, out-of-focus photo" (0 = no vector) */
  q: number;
  /** pixel checks on the 256 px thumbnail; null = undecodable */
  stats: TidyStats | null;
  /** same-shot set members: checks on the 512 px thumbnail, with faces */
  fs?: TidyStats | null;
  /** blurry candidates: Laplacian on a 720 px decode */
  sharp?: number;
  /** same-shot set number (-1 none) and exact-copy group key ('' none) */
  set: number; copy: string;
  /** its row in TidyResult.vecs (zero row = no vector) */
  vi: number;
  /** the owner's face is in it (SFace match against the profile photo); undefined = not checked */
  me?: boolean;
  /** CLIP leans "a whiteboard" / "a printed page" over "a photo"; "a meme" over "a photo" (needs the text pack) */
  doc?: boolean; meme?: boolean;
};

export type Pile = 'same' | 'copies' | 'screens' | 'blurry' | 'paper' | 'chats' | 'private';
/** Order a photo is claimed in: Private first, so a bank-app screenshot is never pre-selected as a screenshot. */
export const ORDER: Pile[] = ['private', 'same', 'copies', 'screens', 'blurry', 'paper', 'chats'];
export const PILES: Record<Pile, { title: string; blurb: string }> = {
  same: { title: 'Same shot', blurb: 'Takes of one moment. The best one stays.' },
  copies: { title: 'Exact copies', blurb: 'The same file saved twice.' },
  screens: { title: 'Screenshots', blurb: 'Older than a month are picked. The rest are yours to check.' },
  blurry: { title: 'Blurry & dark', blurb: 'Black frames are picked. Blurry ones are yours to check.' },
  paper: { title: 'Paper', blurb: 'Receipts, documents, notes. Review only.' },
  chats: { title: 'Saved from chats', blurb: 'Memes and screens other apps saved. Review only.' },
  private: { title: 'Private', blurb: 'IDs, cards, medical papers. Check these yourself.' },
};

/** A photo in a pile: pre = picked for Trash; lock = why it never is (it still can be, after a "Trash anyway?"). */
export type Item = { p: TPhoto; pre: boolean; lock: string | null; note?: string };
export type ShotSet = { photos: TPhoto[]; keeper: number; reason: string };
export type TidyResult = { photos: TPhoto[]; piles: Record<Pile, Item[]>; sets: ShotSet[]; vecs: Float32Array };

const DAY = 86400000;
// ponytail: cutoffs picked by eye, not calibrated; Blurry is review-only until ~50 labelled photos tune them
const BLACK_B = 20, BLACK_SD = 12;
/** Laplacian variance of the 256 px thumbnail under which a photo gets the 720 px blur check */
export const SOFT_LAP = 40;
/** ... and of the 720 px decode under which it is blurry */
const BLUR_LAP = 15;

/** Why a photo is never pre-selected, or null. keep: ids in saved dumps and drafts ('In a dump') or Discover's stories. */
export function lockOf(p: TPhoto, keep: Map<string, string>, now = Date.now()): string | null {
  if (p.fav) return 'Favorite';
  if (keep.has(p.id)) return keep.get(p.id)!;
  if (p.me) return 'You’re in it';
  if (now - p.created < 2 * DAY) return 'Taken in the last 2 days';
  if (p.concepts.length && photoWorth(asIndexed(p)) >= 0.7) return 'Looks like a moment';
  return null;
}

const asIndexed = (p: TPhoto) => ({ ...p, creationTime: p.created, width: p.w, height: p.h, mediaType: 'photo' as const });
const top3 = (p: TPhoto) => p.concepts.slice(0, 3).map(tagGroup);
export const isBlack = (s: TidyStats | null) => !!s && s.b < BLACK_B && s.sd < BLACK_SD;
/** Worth the 720 px blur check: soft thumbnail, CLIP leans blurry, and not a sky, fog, night or concert shot (soft by nature). */
export const softCandidate = (p: TPhoto, soft: Set<number>) =>
  !!p.stats && !isBlack(p.stats) && p.stats.lap < SOFT_LAP && p.q < 0 && !p.concepts.slice(0, 3).some((c) => soft.has(c));
export const isStrict = (p: TPhoto) => top3(p).some((g) => g === 'paper' || g === 'screens');

/** Which pile claims p first (ORDER), whether it's picked and the note shown on it; null = in none. */
function claim(p: TPhoto, shotTag: number, copyKeeper: Set<string>, setKeeper: Set<string>): { pile: Pile; pre: boolean; note?: string } | null {
  if (p.concepts.length && isSensitive(asIndexed(p))) return { pile: 'private', pre: false };
  if (p.set >= 0) return { pile: 'same', pre: !setKeeper.has(p.id) };
  if (p.copy) return { pile: 'copies', pre: !copyKeeper.has(p.id), note: copyKeeper.has(p.id) ? 'The copy that stays' : undefined };
  if (isScreenshot(p.uri)) return { pile: 'screens', pre: Date.now() - p.created > 30 * DAY };
  if (p.concepts[0] === shotTag) return { pile: 'screens', pre: false, note: 'Tag only · check it' };
  if (isBlack(p.stats)) return { pile: 'blurry', pre: true, note: 'Black frame' };
  if (p.sharp != null && p.sharp < BLUR_LAP) return { pile: 'blurry', pre: false };
  const g = top3(p);
  // the top tag, or a top-3 one CLIP's document phrases back up: "paper" or "screens" as a lower tag alone caught signs, menus and sent photos.
  // Paper is what you photographed; text images you were sent or saved (tweets, articles, scans) and memes are Saved from chats, never a photo you're in
  const textish = (k: string) => g[0] === k || (!!p.doc && g.includes(k));
  if (isCameraPhoto(p.uri)) return textish('paper') ? { pile: 'paper', pre: false } : null;
  if (!p.me && (textish('screens') || textish('paper') || p.meme)) return { pile: 'chats', pre: false };
  return null;
}

/** Piles and sets from scanned photos (time order). keep: lockOf's; shotTag: the "a screenshot" vocab id (-1 none). */
export function buildResult(photos: TPhoto[], vecs: Float32Array, keep: Map<string, string>, shotTag: number): TidyResult {
  const groups = (key: (p: TPhoto) => number | string, none: number | string) => {
    const m = new Map<number | string, TPhoto[]>();
    for (const p of photos) if (key(p) !== none) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
    return [...m.values()].filter((g) => g.length > 1);
  };
  const sets = groups((p) => p.set, -1).map(rankSet);
  const setKeeper = new Set(sets.map((s) => s.photos[s.keeper].id));
  // the copy that stays: the camera folder's, else the oldest
  const copyKeeper = new Set(groups((p) => p.copy, '').map((g) => (g.find((p) => isCameraPhoto(p.uri)) ?? g[0]).id));
  const piles = Object.fromEntries(ORDER.map((k) => [k, [] as Item[]])) as Record<Pile, Item[]>;
  for (const p of photos) {
    if (p.set >= 0 && !sets.some((s) => s.photos.includes(p))) p.set = -1; // its set lost the others
    const c = claim(p, shotTag, copyKeeper, setKeeper);
    if (!c) continue;
    const lock = c.pile === 'private' ? null : lockOf(p, keep);
    piles[c.pile].push({ p, pre: c.pre && !lock, lock, note: c.note });
  }
  return { photos, piles, sets, vecs };
}

export type Check = { ok: boolean; text: string };
/** What Shot check can't see: there's no face-expression model on the phone. */
export const NOT_CHECKED = 'Not checked: eyes, smile (needs a face-expression model)';

/** Degrees off level that read as a tilted horizon. ponytail: by eye */
const TILT = 1.5;

const mainFace = (f?: TidyFace[]) => f?.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];

/**
 * Shot check: what we can measure about one photo. peers = the other takes of its set (sharpness and resolution are
 * judged against them); alone, sharpness comes from the blur check if it ran.
 */
export function shotCheck(p: TPhoto, peers?: TPhoto[]): Check[] {
  const s = p.fs ?? p.stats;
  if (!s) return [];
  const out: Check[] = [];
  if (peers?.length) {
    const best = Math.max(...peers.map(sharpOf));
    out.push(sharpOf(p) >= 0.7 * best ? { ok: true, text: 'Sharp' } : { ok: false, text: 'Less sharp' });
    out.push(p.w * p.h >= 0.8 * Math.max(...peers.map((q) => q.w * q.h)) ? { ok: true, text: 'Full resolution' } : { ok: false, text: 'Lower resolution' });
  } else if (p.sharp != null) out.push(p.sharp >= BLUR_LAP ? { ok: true, text: 'Sharp' } : { ok: false, text: 'Blurry' });
  // within a set you're in every take or in none, so this only shows when some take has you and this one doesn't
  if (p.me) out.push({ ok: true, text: 'You’re in it' });
  else if (peers?.some((q) => q.me)) out.push({ ok: false, text: 'You’re not in it' });
  if (s.tilt != null) out.push(Math.abs(s.tilt) >= TILT ? { ok: false, text: 'Tilted' } : { ok: true, text: 'Level' });
  out.push(s.hi > 0.25 ? { ok: false, text: 'Too bright' } : s.lo > 0.4 || s.b < 30 ? { ok: false, text: 'Too dark' } : { ok: true, text: 'Well lit' });
  out.push(s.finger ? { ok: false, text: 'Finger in the corner' } : { ok: true, text: 'Nothing in the way' });
  const f = s.faces;
  if (f?.length) {
    out.push(f.some((x) => x.cut) ? { ok: false, text: 'Face cut off' } : { ok: true, text: 'Faces in frame' });
    const m = mainFace(f)!;
    out.push(Math.abs(m.yaw) > 0.45 ? { ok: false, text: 'Looking away' } : { ok: true, text: 'Facing the camera' });
    out.push(m.l < 0.55 * s.b && m.l < 90 ? { ok: false, text: 'Face in shadow' } : { ok: true, text: 'Face lit' });
  }
  return out;
}

/** Fine detail: the main face's when there is one (that's what a blurry take loses first), else the frame's. */
const sharpOf = (p: TPhoto) => { const s = p.fs ?? p.stats; return mainFace(s?.faces)?.sharp ?? s?.lap ?? 0; };

/**
 * The keeper: the best moment, measured: sharpness and resolution within the set, CLIP's in-focus score, how big and clear
 * the faces are, photo-worth, whether you're in it, minus every failed Shot check. Never how good anyone looks.
 * ponytail: weights by eye; tune on labelled sets.
 */
export function rankSet(photos: TPhoto[]): ShotSet {
  const max = (f: (p: TPhoto) => number) => Math.max(1e-9, ...photos.map(f));
  const qs = photos.map((p) => p.q);
  const qLo = Math.min(...qs), qSpan = Math.max(...qs) - qLo;
  const face = (p: TPhoto) => ((p.fs ?? p.stats)?.faces ?? []).reduce((a, f) => a + f.score * f.w * f.h, 0);
  const terms = photos.map((p) => ({
    sharp: sharpOf(p) / max(sharpOf), res: (p.w * p.h) / max((x) => x.w * x.h), face: face(p) / max(face),
    q: qSpan > 0 ? (p.q - qLo) / qSpan : 0.5, worth: p.concepts.length ? photoWorth(asIndexed(p)) : 0.5,
  }));
  const score = photos.map((p, i) => {
    const t = terms[i];
    return 0.35 * t.sharp + 0.15 * t.q + 0.15 * t.face + 0.1 * t.res + 0.1 * t.worth + (p.me ? 0.15 : 0) - 0.12 * shotCheck(p, photos).filter((c) => !c.ok).length;
  });
  const keeper = score.indexOf(Math.max(...score));
  const k = terms[keeper];
  const reason = photos[keeper].me && !photos.every((p) => p.me) ? 'the one you’re in' : k.sharp === 1 ? 'the sharpest one' : k.face === 1 && face(photos[keeper]) > 0 ? 'the one with the clearest faces'
    : k.res === 1 ? 'the full-resolution one' : 'the one with the fewest misses';
  return { photos, keeper, reason };
}

/** The take least like the keeper (lowest CLIP cosine): "Keep the outtake too" spares it. */
export function outtake(set: ShotSet, keep: number, vecs: Float32Array): TPhoto | null {
  const k = set.photos[keep];
  let best: TPhoto | null = null, lo = Infinity;
  for (const p of set.photos) {
    if (p === k) continue;
    let d = 0;
    for (let i = 0; i < DIM; i++) d += vecs[k.vi * DIM + i] * vecs[p.vi * DIM + i];
    if (d < lo) { lo = d; best = p; }
  }
  return best;
}

/** "2025-03": the month strip's key. */
export const monthOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
