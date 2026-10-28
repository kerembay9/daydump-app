import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { list } from '../../src/services/dumps';

const LONG = 'An autumn of golden retriever puppy splashing through the shallow waves';

beforeAll(() => seedWorld());

test('a story preview: Edit starts its draft; Edit ↔ Preview never piles up', async () => {
  const app = await bootApp('/');
  // another story's preview first, then back: Edit / Preview below must not depend on a clean stack
  await fireEvent.press(await screen.findByLabelText(`${LONG}, 6 photos · Sep 22–Oct 22, 2025`, {}, { timeout: 10000 }));
  await fireEvent.press(await screen.findByLabelText('Back'));
  await fireEvent.press(await screen.findByLabelText('Cinnamon rolls, 7 photos · May 1–Jun 12, 2025'));
  expect(screen.queryByLabelText('Save as draft')).toBeNull();
  expect(await list('draft')).toHaveLength(0);

  // Edit replaces Preview with Edit, which makes the draft; back from Edit goes to Discover
  const path = app.getPathname();
  await fireEvent.press(screen.getByLabelText('Edit'));
  await waitFor(() => expect(app.getPathname()).toBe(path.replace('/preview/', '/edit/')));
  await waitFor(async () => expect((await list('draft')).map((d) => d.title)).toEqual(['Cinnamon rolls']));
  const [draft] = await list('draft');
  expect(draft.photos).toHaveLength(7);
  // Edit's Preview pill: the draft's Preview
  await fireEvent.press(await screen.findByLabelText('Preview'));
  await waitFor(() => expect(app.getPathname()).toBe(`/preview/${draft.id}`));
  // Edit again: back to the same Edit, not a new one
  await fireEvent.press(await screen.findByLabelText('Edit'));
  await waitFor(() => expect(app.getPathname()).toMatch(/^\/edit\//));
  await fireEvent.press(screen.getByLabelText('Back'));
  await waitFor(() => expect(app.getPathname()).toBe('/'));
  expect(await list('draft')).toHaveLength(1);
}, 30000);
