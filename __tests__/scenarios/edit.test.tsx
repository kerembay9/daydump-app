import { act, fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { State } from 'react-native-gesture-handler';
import { seedWorld, world } from '../../jest/world';
import { createDraft, get, list } from '../../src/services/dumps';
import { filterOf } from '../../src/services/filters';
import { frameOf } from '../../src/services/layouts';

beforeAll(() => seedWorld());

test('Continue makes a draft; Edit changes to ratio, fit, looks (all photos / this photo) auto-save', async () => {
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

  // fit: Layout tab, Fill -> Matte
  expect(screen.getByRole('button', { name: 'Fill', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Matte' }));
  await settle();
  expect(frameOf((await get(id))!.fit).fit).toBe('border');

  // looks live on the Photos tab; the Layout controls don't
  expect(screen.queryByRole('button', { name: 'B&W Roll' })).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Photos' }));
  expect(screen.queryByLabelText('1:1 Square')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Matte' })).toBeNull();

  // nothing picked = All photos: the dump's look
  expect(screen.getByText('All photos')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'B&W Roll' }));
  await settle();
  let f = filterOf((await get(id))!.filter);
  expect(f).toEqual({ key: 'noir', pct: 68, per: {}, adj: {} });

  // a photo picked in the strip gets its own look; the others keep the dump's
  const [p1, p2] = draft!.photos.map((p) => p.id);
  const tapStrip = (pid: string) => act(async () => { fireGestureHandler(getByGestureTestId(`strip-tap-${pid}`), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]); });
  await tapStrip(p2);
  await screen.findByLabelText('This photo. Tap for all photos');
  await fireEvent.press(screen.getByRole('button', { name: 'Sunfade' }));
  await settle();
  f = filterOf((await get(id))!.filter);
  expect(f.key).toBe('noir');
  expect(f.per).toEqual({ [p2]: { key: 'sunfade', pct: 68 } });
  expect(screen.getByLabelText(/^Photo 2, edited\./)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reset photo' })).toBeTruthy();

  // hold the slide: the originals, until let go
  const slide = screen.getAllByLabelText(/^Slide 1 of/)[0];
  await fireEvent(slide, 'longPress');
  expect(screen.getByText('Showing original')).toBeTruthy();
  await fireEvent(slide, 'pressOut');
  expect(screen.getByText('Hold to compare')).toBeTruthy();

  // Reset photo drops its own look; tapping it again lets it go (no cover change on this tab)
  await fireEvent.press(screen.getByRole('button', { name: 'Reset photo' }));
  await settle();
  expect(filterOf((await get(id))!.filter).per).toEqual({});
  await tapStrip(p2);
  expect(await screen.findByText('All photos')).toBeTruthy();
  expect((await get(id))!.photos.map((p) => p.id).slice(0, 2)).toEqual([p1, p2]);

  // Use on every photo: the picked photo's look becomes the dump's
  await tapStrip(p1);
  await fireEvent.press(await screen.findByRole('button', { name: 'Cashmere' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Use on every photo' }));
  await settle();
  expect(filterOf((await get(id))!.filter)).toEqual({ key: 'cashmere', pct: 68, per: {}, adj: {} });
  await tapStrip(p1);
  await fireEvent.press(screen.getByRole('button', { name: 'B&W Roll' }));

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
  expect(await screen.findByRole('button', { name: 'Matte', selected: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('tab', { name: 'Photos' }));
  expect(await screen.findByRole('button', { name: 'B&W Roll', selected: true })).toBeTruthy();
}, 30000);

test('Photos: Adjust (Brighten, Auto, ruler with a 0 detent) is per photo, Texture rides the look; Layout: Frame and arrangement tiles', async () => {
  const photos = world.photos.slice(0, 3).map((p) => ({ id: p.id, uri: p.uri }));
  const d = await createDraft({ source: 'create', photos, ratio: '4:5' });
  await bootApp(`/edit/${d.id}`);
  const saved = async () => { await settle(); return (await get(d.id))!; };
  const drag = async (name: string, grant: number, to?: number) => {
    const s = screen.getByLabelText(name);
    await fireEvent(s, 'layout', { nativeEvent: { layout: { width: 200 } } });
    await fireEvent(s, 'responderGrant', { nativeEvent: { pageX: 20 + grant, locationX: grant } }); // track starts at page x 20
    if (to != null) await fireEvent(s, 'responderMove', { nativeEvent: { pageX: 20 + to, locationX: 3 } });
  };

  // Layout: grid guide on slide 1 at 4:5; arrangement tiles; Frame card
  expect(await screen.findByTestId('grid-guide')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Scrapbook' }));
  expect((await saved()).layout).toBe('scrapbook');
  await fireEvent.press(screen.getByRole('button', { name: '3 Bento' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Blur fill' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Kraft matte' }));
  await drag('Gap', 100); // 0-12: half way = 6
  await drag('Corners', 50); // 0-16: a quarter = 4
  await fireEvent(screen.getByLabelText('Grid guide'), 'valueChange', false);
  expect(frameOf((await saved()).fit)).toEqual({ fit: 'blur', gap: 6, corners: 4, matte: 'kraft', guide: false });
  expect(screen.queryByTestId('grid-guide')).toBeNull();
  expect(screen.getByText('Whole photos on blur')).toBeTruthy(); // blur fill: nothing to crop

  // Photos → Adjust: with nothing picked it changes the slide's first photo; the dark photo offers Brighten
  await fireEvent.press(screen.getByRole('tab', { name: 'Photos' }));
  await fireEvent.press(screen.getByRole('tab', { name: 'Adjust' }));
  expect(screen.getByText('Photo 1')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Brighten, this photo looks dark'));
  let adj = filterOf((await saved()).filter).adj;
  expect(Object.keys(adj)).toEqual([photos[0].id]);
  expect(adj[photos[0].id].light).toBeGreaterThanOrEqual(25);
  expect(screen.queryByLabelText('Brighten, this photo looks dark')).toBeNull();
  expect(screen.getByLabelText(/^Photo 1, cover, edited\./)).toBeTruthy();

  // the ruler: 50 on Contrast, then back near 0 clicks to 0
  await fireEvent.press(screen.getByLabelText('Contrast 0'));
  await drag('Contrast', 150);
  expect(filterOf((await saved()).filter).adj[photos[0].id].contrast).toBe(50);
  await drag('Contrast', 100, 103);
  expect(filterOf((await saved()).filter).adj[photos[0].id].contrast).toBe(0);

  // Auto sets every slider; tapping Auto ✓ undoes it
  await fireEvent.press(screen.getByLabelText('Auto'));
  adj = filterOf((await saved()).filter).adj;
  expect(adj[photos[0].id]).toMatchObject({ saturation: 8, sharpen: 20 });
  expect(adj[photos[0].id].shadows).toBeGreaterThan(0);
  await fireEvent.press(screen.getByLabelText('Auto on. Tap to undo'));
  expect(filterOf((await saved()).filter).adj[photos[0].id]).toEqual({});

  // Texture: part of the look (All photos here), kept when the preset changes
  await fireEvent.press(screen.getByRole('tab', { name: 'Texture' }));
  await drag('Grain', 80); // 40
  await fireEvent.press(screen.getByRole('tab', { name: 'Look' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sunfade' }));
  const f = filterOf((await saved()).filter);
  expect([f.key, f.grain]).toEqual(['sunfade', 40]);

  // reopened: the frame comes back
  screen.unmount();
  await bootApp(`/edit/${d.id}`);
  expect(await screen.findByRole('button', { name: 'Blur fill', selected: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kraft matte', selected: true })).toBeTruthy();
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

test('slides: tapping the left third goes back, the rest forward, both wrapping', async () => {
  const d = await createDraft({ source: 'create', photos: world.photos.slice(0, 3).map((p) => ({ id: p.id, uri: p.uri })), layout: 'single' });
  await bootApp(`/edit/${d.id}`);
  expect(await screen.findByText('Tap sides · drag to crop')).toBeTruthy();
  expect(screen.getByText('1/3')).toBeTruthy();

  // every page taps relative to the active slide; jest's FlatList never scrolls, so the first page is always mounted
  const tap = (x: number) => fireEvent.press(screen.getAllByLabelText(/^Slide \d of 3$/)[0], { nativeEvent: { locationX: x } });
  await tap(5);
  expect(await screen.findByText('3/3')).toBeTruthy();
  await tap(9999);
  expect(await screen.findByText('1/3')).toBeTruthy();
  await tap(9999);
  expect(await screen.findByText('2/3')).toBeTruthy();
}, 30000);

test('Layout fits the first screen: ratio pills show only the ratio, Dump order sits right under the slides', async () => {
  const photos = world.photos.slice(0, 3).map((p) => ({ id: p.id, uri: p.uri }));
  const d = await createDraft({ source: 'create', photos, ratio: '4:5' });
  await bootApp(`/edit/${d.id}`);
  await screen.findByLabelText('1:1 Square'); // a11y keeps the name
  expect(screen.getByText('1:1')).toBeTruthy();
  for (const name of ['IG Post', 'Square', 'TikTok', 'Film 35']) expect(screen.queryByText(name)).toBeNull();
  // tree order: Dump order before the Frame card
  const json = JSON.stringify(screen.toJSON());
  expect(json.indexOf('Dump order')).toBeGreaterThan(-1);
  expect(json.indexOf('Dump order')).toBeLessThan(json.indexOf('"Blur fill"'));
}, 30000);
