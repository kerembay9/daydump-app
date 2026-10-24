import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { list } from '../../src/services/dumps';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';

beforeAll(() => seedWorld());

test('a story preview saves as a draft and opens Edit; Edit ↔ Preview never piles up', async () => {
  const app = await bootApp('/');
  // another story's preview first, then back: Edit / Preview below must not depend on a clean stack
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 7 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Back'));
  await fireEvent.press(await screen.findByLabelText('Cinnamon rolls, 8 photos · May–Jun 2025'));
  await fireEvent.press(await screen.findByLabelText('Save as draft'));
  await waitFor(async () => expect((await list('draft')).map((d) => d.title)).toEqual(['Cinnamon rolls']));
  const [draft] = await list('draft');
  expect(draft.photos).toHaveLength(8);
  // now it's in Library: no second Save as draft
  await waitFor(() => expect(screen.queryByLabelText('Save as draft')).toBeNull());

  // Edit replaces Preview: back from Edit goes to Discover
  const path = app.getPathname();
  await fireEvent.press(screen.getByLabelText('Edit'));
  await waitFor(() => expect(app.getPathname()).toBe(path.replace('/preview/', '/edit/')));
  // Edit's Preview pill, then Edit again: back to the same Edit, not a new one
  await fireEvent.press(await screen.findByLabelText('Preview'));
  await waitFor(() => expect(app.getPathname()).toBe(`/preview/${draft.id}`));
  await fireEvent.press(await screen.findByLabelText('Edit'));
  await waitFor(() => expect(app.getPathname()).toMatch(/^\/edit\//));
  await fireEvent.press(screen.getByLabelText('Back'));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
  expect(await list('draft')).toHaveLength(1);
}, 30000);
