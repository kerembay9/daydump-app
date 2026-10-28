import { hits } from '../src/services/today';

// Scores read off the phone's Today tags screen (Oct 28 2026). A phrase matches only when it stands out from the photo's others.
test('Today matching: clear photos match their prompt, a dark busy one matches nothing', () => {
  const mug = { coffee: 0.33, food: 0.2, closeup: 0.164, blue: 0.141, window: 0.137, book: 0.126, you: 0.116, desk: 0.115, pet: 0.115, plant: 0.11, sky: 0.103, hands: 0.095, lights: 0.095, friends: 0.081, shoes: 0.074, mirror: 0.071, wide: 0.062 };
  const hand = { hands: 0.244, book: 0.214, desk: 0.173, blue: 0.151, you: 0.146, closeup: 0.139, coffee: 0.127, window: 0.117, mirror: 0.112, shoes: 0.111, pet: 0.105, sky: 0.101, food: 0.092, plant: 0.092, friends: 0.083, lights: 0.053, wide: 0.043 };
  const plant = { desk: 0.236, book: 0.236, lights: 0.22, mirror: 0.22, you: 0.201, window: 0.199, blue: 0.196, plant: 0.194, coffee: 0.184, sky: 0.158, closeup: 0.158, pet: 0.157, hands: 0.145, friends: 0.145, shoes: 0.144, food: 0.144, wide: 0.1 };
  expect(hits(mug)).toEqual(['coffee']);
  expect(hits(hand)).toEqual(['hands']);
  expect(hits(plant)).toEqual([]);
});
