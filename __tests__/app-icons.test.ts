// plugins/withAppIcons.js moves the launcher entry onto one alias per icon, so the dev switch can swap them.
import { manifest } from '../plugins/withAppIcons.js';

const launcher = { action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }], category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }] };
const share = { action: [{ $: { 'android:name': 'android.intent.action.SEND' } }] };
const template = () => ({ manifest: { application: [{ $: { 'android:name': '.MainApplication' }, activity: [{ $: { 'android:name': '.MainActivity' }, 'intent-filter': [launcher, share] }] }] } });

test('MainActivity keeps its other filters; the default alias launches, the others start disabled; reruns stay the same', () => {
  const once = manifest(template(), ['dark', 'cards']);
  const app = once.manifest.application[0] as any;
  expect(app.activity[0]['intent-filter']).toEqual([share]);
  expect(app['activity-alias'].map((a: any) => [a.$['android:name'], a.$['android:enabled'], a.$['android:icon']])).toEqual([
    ['.MainActivity_default', 'true', '@mipmap/ic_launcher'],
    ['.MainActivity_dark', 'false', '@mipmap/ic_launcher_dark'],
    ['.MainActivity_cards', 'false', '@mipmap/ic_launcher_cards'],
  ]);
  expect(app['activity-alias'].every((a: any) => a.$['android:targetActivity'] === '.MainActivity' && a['intent-filter'][0].category[0].$['android:name'].endsWith('LAUNCHER'))).toBe(true);
  expect(manifest(JSON.parse(JSON.stringify(once)), ['dark', 'cards'])).toEqual(once);
});
