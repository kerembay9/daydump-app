import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { bootApp, settle } from '../../jest/app';
import { seedWorld } from '../../jest/world';
import { getProfile, setProfile } from '../../src/services/profile';

beforeAll(() => seedWorld());

test('Profile: "Photos per dump" range saves and Discover follows it', async () => {
  await bootApp('/profile');
  expect(await screen.findByLabelText('Fewest photos, 4')).toBeTruthy();
  expect(screen.getByLabelText('Most photos, 10')).toBeTruthy();
  // min can't go below 4
  expect(screen.getByLabelText('Lower fewest photos').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(screen.getByLabelText('Raise fewest photos'));
  await waitFor(() => expect(screen.getByLabelText('Fewest photos, 5')).toBeTruthy());
  for (let i = 0; i < 5; i++) await fireEvent.press(screen.getByLabelText('Lower most photos'));
  // max stops at min
  await waitFor(() => expect(screen.getByLabelText('Most photos, 5')).toBeTruthy());
  expect(screen.getByLabelText('Lower most photos').props.accessibilityState).toMatchObject({ disabled: true });
  await settle();
  expect(await getProfile()).toMatchObject({ slidesMin: 5, slidesMax: 5 });

  await bootApp('/');
  await screen.findByLabelText('Preview A week in Seattle', {}, { timeout: 10000 });
  const metas = screen.getAllByLabelText(/, \d+ photos · /).map((x) => Number(/, (\d+) photos/.exec(x.props.accessibilityLabel)![1]));
  expect(metas.length).toBeGreaterThan(0);
  expect(metas.every((m) => m <= 5)).toBe(true);
  await setProfile({ slidesMin: 4, slidesMax: 10 });
}, 30000);
