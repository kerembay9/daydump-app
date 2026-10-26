import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { State } from 'react-native-gesture-handler';
import { seedWorld, world } from '../../jest/world';
import { createDraft, get, list } from '../../src/services/dumps';
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
  expect(screen.queryByText('Caption ideas')).toBeNull(); // caption suggestions removed
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

  // strength: one value label; drag follows the finger's page x even when locationX jumps to a child's frame
  expect(screen.getAllByText('68%')).toHaveLength(1);
  const slider = screen.getByLabelText('Filter strength');
  await fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 200 } } });
  await fireEvent(slider, 'responderGrant', { nativeEvent: { pageX: 120, locationX: 100 } }); // track starts at page x 20
  await fireEvent(slider, 'responderMove', { nativeEvent: { pageX: 70, locationX: 5 } });
  await settle();
  expect(filterOf((await get(id))!.filter).pct).toBe(25);
  expect(screen.getAllByText('25%')).toHaveLength(1);

  // reopened later: the saved state comes back
  screen.unmount();
  await bootApp(`/edit/${id}`);
  expect(await screen.findByRole('button', { name: 'B&W Roll', selected: true })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Apply to all photos' }).props.accessibilityState).toEqual({ checked: true });
}, 30000);

test('Crop: dragging / pinching a photo picks the part shown, saved with the dump', async () => {
  const [p] = world.photos;
  const d = await createDraft({ source: 'create', photos: [{ id: p.id, uri: p.uri }], ratio: '9:16' });
  await bootApp(`/edit/${d.id}`);
  expect(await screen.findByText('Drag or pinch a photo')).toBeTruthy();
  // the mocked photo is 4:5, so in a 9:16 cell it overflows sideways: dragging left shows more of its right side
  // the gestures run as worklets: the crop is handed to the screen on the next tick, so tick inside the act
  await act(async () => { fireGestureHandler(getByGestureTestId('crop-pan'), [
    { state: State.BEGAN, x: 50, y: 50, translationX: 0 },
    { state: State.ACTIVE, x: 50, y: 50, translationX: -20 },
    { state: State.ACTIVE, x: 50, y: 50, translationX: -40 },
    { state: State.END, x: 50, y: 50, translationX: -40 },
  ]); await jest.advanceTimersByTimeAsync(0); });
  await settle();
  const crop = (await get(d.id))!.photos[0].crop!;
  expect(crop.x).toBeGreaterThan(0.5);
  expect(crop.y).toBe(0.5);

  // pinch: zooms in from the dragged crop, which stays where it was
  await act(async () => { fireGestureHandler(getByGestureTestId('crop-pinch'), [
    { state: State.BEGAN, focalX: 50, focalY: 50, scale: 1 },
    { state: State.ACTIVE, focalX: 50, focalY: 50, scale: 1.5 },
    { state: State.ACTIVE, focalX: 50, focalY: 50, scale: 2 },
    { state: State.END, focalX: 50, focalY: 50, scale: 2 },
  ]); await jest.advanceTimersByTimeAsync(0); });
  await settle();
  const zoomed = (await get(d.id))!.photos[0].crop!;
  expect(zoomed.z).toBeCloseTo(2);
  expect(zoomed.x).toBeCloseTo(crop.x);
}, 30000);

test('the title on top is editable and auto-saves; a cleared title keeps the old one', async () => {
  const [p] = world.photos;
  const d = await createDraft({ source: 'create', title: 'Beach day', photos: [{ id: p.id, uri: p.uri }] });
  await bootApp(`/edit/${d.id}`);
  const input = await screen.findByLabelText('Dump title');
  expect(input.props.value).toBe('Beach day');
  expect(screen.queryByText('Sizes · Filter %')).toBeNull();

  await fireEvent.changeText(input, 'Sunset swim');
  await settle();
  expect((await get(d.id))!.title).toBe('Sunset swim');

  await fireEvent.changeText(input, '  ');
  await settle();
  expect((await get(d.id))!.title).toBe('Beach day');
  await fireEvent(input, 'endEditing');
  expect(screen.getByLabelText('Dump title').props.value).toBe('Beach day');
}, 30000);
