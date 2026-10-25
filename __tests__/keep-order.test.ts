import { keepOrder } from '../src/state/AppState';

const s = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(' ');

test('a gallery sync keeps Discover order: known stories stay put, new ones slot in at their rank, gone ones drop', () => {
  expect(ids(keepOrder(s('a', 'b', 'c', 'd'), s('c', 'a', 'd', 'b')))).toBe('a b c d');
  expect(ids(keepOrder(s('a', 'b', 'c'), s('new', 'c', 'b', 'a')))).toBe('new a b c');
  expect(ids(keepOrder(s('a', 'b', 'c'), s('b', 'a', 'new')))).toBe('a b new');
  expect(ids(keepOrder(s('a', 'b'), s('b')))).toBe('b');
});
