import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { get, list } from '../../src/services/dumps';
import { filterOf } from '../../src/services/filters';

beforeAll(() => seedWorld());

test('Continue makes a draft; Edit changes to ratio, filter and Apply-to-all auto-save', async () => {
  const app = await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  await fireEvent.changeText(screen.getByPlaceholderText('Search keyword, place, date...'), 'seattle');
  await screen.findByText('Matches for "seattle" (21)');
  for (const c of screen.getAllByLabelText(/^Photo from Aug \d+, 2025$/).slice(0, 3)) await fireEvent.press(c);

  await fireEvent.press(screen.getByLabelText('Continue with 3 photos'));
  await screen.findByLabelText('1:1 Square');
  const id = app.getPathname().split('/').pop()!;
  expect(app.getPathname()).toBe(`/edit/${id}`);
  const draft = await get(id);
  expect(draft).toMatchObject({ status: 'draft', title: 'Seattle', ratio: '4:5' });
  expect(draft!.photos).toHaveLength(3);
  expect((await list()).map((d) => d.id)).toContain(id);

  // ratio
  await fireEvent.press(screen.getByLabelText('1:1 Square'));
  await settle();
  expect((await get(id))!.ratio).toBe('1:1');

  // filter: per slide, then for everyone
  expect(screen.getByRole('checkbox', { name: 'Apply to all photos' }).props.accessibilityState).toEqual({ checked: true });
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Apply to all photos' }));
  expect(await screen.findByText('Changes apply to this slide only.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'B&W Roll' }));
  await settle();
  let f = filterOf((await get(id))!.filter);
  expect(f.all).toBe(false);
  expect(Object.values(f.per).map((l) => l.key)).toContain('noir');
  expect(f.key).toBe('none'); // the other slides keep the dump's look

  await fireEvent.press(screen.getByRole('checkbox', { name: 'Apply to all photos' }));
  await settle();
  f = filterOf((await get(id))!.filter);
  expect(f).toMatchObject({ all: true, key: 'noir', per: {} });
  expect(screen.queryByText('Changes apply to this slide only.')).toBeNull();

  // reopened later: the saved state comes back
  screen.unmount();
  await bootApp(`/edit/${id}`);
  expect(await screen.findByRole('button', { name: 'B&W Roll', selected: true })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Apply to all photos' }).props.accessibilityState).toEqual({ checked: true });
}, 30000);
