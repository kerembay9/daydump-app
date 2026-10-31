import fs from 'node:fs';
import path from 'node:path';

const LISTING_DIR = path.join(__dirname, '../store/listing');

const LIMITS: Record<string, number> = {
  Title: 30,
  'Subtitle (App Store)': 30,
  'Short description (Play)': 80,
  'Keywords (App Store, comma separated)': 100,
  'Promotional text (App Store)': 170,
  Description: 4000,
};

function parseListing(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  let currentSec: string | null = null;
  let text: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSec) sections[currentSec] = text.join('\n').trim();
      currentSec = line.replace('## ', '').trim();
      text = [];
    } else if (currentSec) {
      text.push(line);
    }
  }
  if (currentSec) sections[currentSec] = text.join('\n').trim();
  return sections;
}

describe('Store Listings', () => {
  const files = fs.readdirSync(LISTING_DIR).filter((f) => f.endsWith('.md')).sort();

  test('at least 13 core languages are present in store/listing', () => {
    expect(files.length).toBeGreaterThanOrEqual(13);
    const expected = ['ar', 'de', 'en-US', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr', 'zh'];
    for (const exp of expected) {
      expect(files).toContain(`${exp}.md`);
    }
  });

  test.each(files)('%s has all required sections and conforms to store limits', (file) => {
    const content = fs.readFileSync(path.join(LISTING_DIR, file), 'utf8');
    const sections = parseListing(content);

    for (const [sectionName, maxLen] of Object.entries(LIMITS)) {
      const val = sections[sectionName];
      expect(val).toBeDefined();
      expect(typeof val).toBe('string');
      const len = [...val].length;
      expect(len).toBeGreaterThan(0);
      expect(len).toBeLessThanOrEqual(maxLen);
    }

    // Verify official URLs
    expect(sections.Description).toContain('https://www.horizonzeta.com/terms-of-service/PicDump');
    expect(sections.Description).toContain('https://www.horizonzeta.com/privacy-policy/PicDump');
    expect(sections.Description).toContain('https://www.horizonzeta.com/picdump/support');
  });
});
