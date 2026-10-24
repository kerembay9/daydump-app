import { packCopy } from '../src/components/ModelLoading';

test("unavailable shows Play's error code, so a tester's screenshot says why", () => {
  expect(packCopy('vision', { state: 'unavailable', progress: 0, error: -1 })[1]).toContain('(Play error -1)');
  expect(packCopy('vision', { state: 'unavailable', progress: 0, error: 0 })[1]).not.toContain('Play error');
});
