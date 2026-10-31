import { fireEvent, screen } from 'expo-router/testing-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunToAsk, goToStep } from '../../jest/app';
import { seedWorld } from '../../jest/world';

const rc = jest.requireMock('react-native-purchases').default as { purchasePackage: jest.Mock };

beforeAll(() => seedWorld());
beforeEach(() => AsyncStorage.clear());

test('onboarding paywall: the plans load from the offering, the trial plan is picked, subscribing lands on the Pro welcome', async () => {
  await fireEvent.press(await firstRunToAsk());
  await goToStep('29'); // the questions in between need no answers here
  expect(await screen.findByLabelText(/^Annual, \$29\.99/)).toBeTruthy();
  expect(await screen.findByLabelText(/^Weekly, \$3\.99/)).toBeTruthy();
  expect(screen.getByText('Billed weekly')).toBeTruthy(); // the weekly plan doesn't say monthly
  await fireEvent.press((await screen.findAllByText(/^Start /)).at(-1)!);
  expect(rc.purchasePackage).toHaveBeenCalledTimes(1);
  expect(rc.purchasePackage.mock.calls[0][0].identifier).toBe('$rc_annual'); // the plan with a trial is preselected
  expect(await screen.findByText('Welcome to PicDump Pro!', {}, { timeout: 10000 })).toBeTruthy();
}, 30000);
