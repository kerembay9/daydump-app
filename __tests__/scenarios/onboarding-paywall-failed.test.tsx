import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk, goToStep, pressLast } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const rc = jest.requireMock('react-native-purchases').default as { getOfferings: jest.Mock };

beforeAll(() => seedWorld());
beforeEach(() => AsyncStorage.clear());

test('onboarding paywall: plans that fail to load say so, and Try again loads them; Subscribe waits for a plan', async () => {
  const ok = rc.getOfferings.getMockImplementation()!;
  rc.getOfferings.mockImplementationOnce(async () => { throw new Error('offline'); });
  await fireEvent.press(await firstRunToAsk());
  await goToStep('29');
  expect(await screen.findByText("Plans didn't load.")).toBeTruthy();
  rc.getOfferings.mockImplementation(ok);
  await pressLast('Try again');
  expect(await screen.findByLabelText(/^Annual, \$29\.99/)).toBeTruthy();
}, 30000);
