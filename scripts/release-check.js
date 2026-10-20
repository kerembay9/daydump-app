// Fails release builds while the legal text still has placeholders (see RELEASE-BLOCKER in LegalModal.tsx).
/* global __dirname */
const fs = require('fs');
const path = require('path');

const PLACEHOLDERS = ['[PROVIDER]', '[ADDRESS]', '[COUNTRY]', '[EFFECTIVE DATE]'];
const file = path.join(__dirname, '..', 'src/components/LegalModal.tsx');
// Skip // comment lines so the RELEASE-BLOCKER note itself doesn't trip the check.
const src = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
const left = PLACEHOLDERS.filter((p) => src.includes(p));
const release = process.env.EAS_BUILD_PROFILE === 'production' || process.env.RELEASE === '1';

if (!left.length) process.exit(0);
if (release) {
  console.error(`release-check: LegalModal.tsx still contains ${left.join(' ')}. Fill them before a store release.`);
  process.exit(1);
}
console.warn(`release-check: warning, legal placeholders unfilled (${left.join(' ')}); fine for non-release builds.`);
