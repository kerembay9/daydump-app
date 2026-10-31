import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk, goToStep, pressLast } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const rc = jest.requireMock('react-native-purchases').default as { purchasePackage: jest.Mock };

beforeAll(() => seedWorld());
beforeEach(() => AsyncStorage.clear());

test('onboarding paywall: "Continue free" buys nothing and lands on the free welcome, and Open Discover finishes onboarding', async () => {
  await fireEvent.press(await firstRunToAsk());
  await goToStep('29');
  await pressLast('Continue free');
  expect(rc.purchasePackage).not.toHaveBeenCalled();
  expect(await screen.findByText("You're in. Your first dump is waiting.", {}, { timeout: 10000 })).toBeTruthy();
  await pressLast('Open Discover');
  expect(await AsyncStorage.getItem('@daydump_has_completed_onboarding')).toBe('true');
}, 30000);
