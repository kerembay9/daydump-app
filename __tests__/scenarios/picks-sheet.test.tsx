import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld());

test('Picks sheet: select, Hide, then after a tab round trip (Create frozen meanwhile) it reopens with the same picks, none selected', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  const cells = screen.getAllByLabelText(/^Photo from /);
  for (const i of [0, 4]) await fireEvent.press(cells[i]);

  await fireEvent.press(screen.getByLabelText('Picks: 2. Review'));
  expect(await screen.findByText('Your picks (2/6 photos)')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Photo 2'));
  expect(screen.getByLabelText('Photo 2').props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(screen.getByText('Hide'));
  await settle();
  expect(screen.queryByText(/^Your picks/)).toBeNull();

  await fireEvent.press(screen.getByLabelText('Library'));
  await settle();
  await fireEvent.press(screen.getByLabelText('Create'));
  await settle();
  await fireEvent.press(screen.getByLabelText('Picks: 2. Review'));
  expect(await screen.findByText('Your picks (2/6 photos)')).toBeTruthy();
  expect(screen.getByLabelText('Photo 2').props.accessibilityState).toMatchObject({ selected: false });
}, 30000);
