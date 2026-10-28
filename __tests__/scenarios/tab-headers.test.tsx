import { fireEvent, screen } from 'expo-router/testing-library';
import { bootApp } from '../../jest/app';
import { seedWorld } from '../../jest/world';

beforeAll(() => seedWorld());

test('Create and Library have no title (the tab bar names them); the avatar sits in their first row and opens Profile', async () => {
  await bootApp('/create');
  await screen.findByText('Your gallery (77)', {}, { timeout: 10000 });
  expect(screen.getAllByText('Create')).toHaveLength(1); // the tab bar's label only
  await fireEvent.press(screen.getByLabelText('Profile and settings'));
  await screen.findByText('Profile & Settings');

  screen.unmount();
  await bootApp('/library');
  await screen.findByText(/^Drafts/, {}, { timeout: 10000 });
  expect(screen.getAllByText('Library')).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText('Profile and settings'));
  await screen.findByText('Profile & Settings');
}, 30000);
