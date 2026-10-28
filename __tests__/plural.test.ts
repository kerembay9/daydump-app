import { plural, topicTitle } from '../src/services/stories/titles';

test('plural handles irregular and mass nouns', () => {
  expect(plural('woman')).toBe('women');
  expect(plural('spider-man')).toBe('spider-men');
  expect(plural('human')).toBe('humans');
  expect(plural('kitchen knife')).toBe('kitchen knives');
  expect(plural('street food')).toBe('street food');
  expect(plural('sheep')).toBe('sheep');
  expect(plural('cherry')).toBe('cherries');
  expect(plural('box')).toBe('boxes');
  expect(plural('dog')).toBe('dogs');
});

test('a long "woman" topic is titled "Women"', () => {
  const start = new Date(2025, 0, 1).getTime();
  expect(topicTitle({ name: 'woman', start, end: start + 200 * 86_400_000 })).toBe('Women');
});
