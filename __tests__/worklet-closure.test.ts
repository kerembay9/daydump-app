// Edit's crop drag runs placePhoto on the UI thread with a photo's crop that may be unset. The worklet reads its
// closure (CENTRED) in its body, after default params are evaluated, so `crop = CENTRED` threw there and Edit errored.
// Runs the code the worklet plugin ships to the UI thread, bound to its closure, as that runtime does.
import { placePhoto } from '../src/services/layouts';

test('placePhoto runs on the UI thread without a crop', () => {
  const w = placePhoto as unknown as { __closure: object; __initData: { code: string } };
  const uiPlacePhoto = new Function(`return ${w.__initData.code}`)().bind({ __closure: w.__closure });
  expect(uiPlacePhoto(900, 1600, 4000, 3000).crop).toEqual(placePhoto(900, 1600, 4000, 3000).crop);
});
