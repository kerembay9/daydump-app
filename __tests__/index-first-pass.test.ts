import { capIndex, indexLibrary, loadLibrary } from '../src/services/index/photoIndex';
import { photo, seedWorld } from '../jest/world';

const N = 300;
beforeAll(() => seedWorld(Array.from({ length: N }, (_, i) => photo(new Date(2025, 0, 1 + Math.floor(i / 4), 6 * (i % 4)), [i % 5]))));
afterEach(() => capIndex(null));

test('a first pass of the newest photos is followed at once by the rest: nothing waits for the cap to be lifted', async () => {
  capIndex(100);
  const totals: number[] = [];
  const n = await indexLibrary((done, total) => totals.push(total));
  expect(totals[0]).toBe(100); // the first pass: only the newest 100
  expect(totals.at(-1)).toBe(N - 100); // then the rest, in the same call
  expect(n).toBe(N);
  expect((await loadLibrary())!.photos.length).toBe(N);
}, 30000);
