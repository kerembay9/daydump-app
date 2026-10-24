import { people } from '../src/app/people';

const face = { score: 1, x: 0, y: 0, w: 0.2, h: 0.2, vec: 'AA==' };
const scans = { a: { aspect: 1, faces: [face] }, b: { aspect: 1, faces: [face] }, c: { aspect: 1, faces: [face] } };

test('groups given the same name (any case) are one person', () => {
  const ps = people({ scans, names: { 'a#0': 'Ada', 'b#0': 'ada' } }, { 'a#0': 0, 'b#0': 1, 'c#0': 2 });
  expect(ps.map((p) => [p.name, p.photos])).toEqual([['Ada', 2], ['', 1]]);
});
