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

test('titles say what people say: "Bars", not "Drinking establishments"; holidays and seasons stay as they are', () => {
  const start = new Date(2025, 0, 1).getTime(), long = start + 200 * 86_400_000;
  expect(topicTitle({ name: 'drinking establishment', start, end: long })).toBe('Bars');
  expect(topicTitle({ name: 'eastern bath white', start, end: long })).toBe('Butterflies');
  expect(topicTitle({ name: 'canada day', start, end: long })).toBe('Canada day');
  expect(topicTitle({ name: 'summer', start, end: long })).toBe('Summer');
  expect(topicTitle({ name: 'a beach day', start, end: long })).toBe('Beach days');
  expect(plural('cycling')).toBe('cycling');
  expect(plural('building')).toBe('buildings');
  expect(plural('formal wear')).toBe('formal wear');
});

test('two stories with one title never add this year: "Coffee" / "Coffee, 2024", "Coffee in summer" / "Coffee in autumn"', () => {
  const { disambiguate } = require('../src/services/stories/titles');
  const now = new Date(2026, 9, 28).getTime();
  const at = (y: number, m: number) => ({ title: 'Coffee', start: new Date(y, m, 1).getTime(), end: new Date(y, m, 10).getTime() });
  const titles = (...s: { title: string }[]) => disambiguate(s, now).map((x: { title: string }) => x.title);
  expect(titles(at(2026, 6), at(2024, 6))).toEqual(['Coffee', 'Coffee, 2024']);
  expect(titles(at(2026, 6), at(2026, 9))).toEqual(['Coffee in summer', 'Coffee in autumn']);
  expect(titles(at(2026, 6), at(2026, 7))).toEqual(['Coffee in July', 'Coffee in August']);
  expect(titles(at(2025, 6), at(2025, 9))).toEqual(['Coffee in summer 2025', 'Coffee in autumn 2025']);
});
