import { buildResult, TPhoto } from '../src/services/tidy/rules';

// worth.json groups: 132 paper, 130 screens, 73 pets
const p = (id: string, uri: string, concepts: number[], x: Partial<TPhoto> = {}): TPhoto => ({
  id, uri, created: new Date(2025, 4, 1).getTime(), w: 3000, h: 4000, size: 2e6, fav: false,
  concepts, conceptScores: concepts.map(() => 0.3), q: 0, stats: null, set: -1, copy: '', vi: 0, ...x,
});
const cam = (id: string) => `file:///storage/emulated/0/DCIM/Camera/${id}.jpg`;
const sent = (id: string) => `file:///storage/emulated/0/Pictures/WhatsApp/${id}.jpg`;

test('Paper is a document you photographed; saved text images and memes are Saved from chats, sent photos are neither', () => {
  const r = buildResult([
    p('doc', cam('doc'), [132]),
    p('tweet', sent('tweet'), [132]),
    p('meme', sent('meme'), [73], { meme: true }),
    // a sent photo of a cat with "screens" only as its 2nd tag
    p('cat', sent('cat'), [73, 130, 74]),
    p('you', sent('you'), [132], { me: true }),
  ], new Float32Array(512), new Map(), -1);
  expect(r.piles.paper.map((x) => x.p.id)).toEqual(['doc']);
  expect(r.piles.chats.map((x) => x.p.id).sort()).toEqual(['meme', 'tweet']);
});
