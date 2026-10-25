// The pure-logic checks (dateRange, search parser, layouts chunking, filter identity, suggest disjointness, captions,
// post pipeline, ...) live in scripts/selfcheck.ts so they also run without jest (npx -y tsx scripts/selfcheck.ts).
// Its top-level asserts run on import; `done` covers the async post-pipeline part.
import { done } from '../scripts/selfcheck';

jest.spyOn(console, 'warn').mockImplementation(() => {}); // its failure-path checks warn on purpose
test('scripts/selfcheck.ts', () => done);
