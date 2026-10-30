// App text: tr('section.key'). en.json is the source; every other language file in locales/ starts empty and falls back to English
// until it is translated. The language follows the phone (on Android it follows a change when the app comes back to the front).
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { LANGUAGES } from './languages';
import { translations } from './translations';

const KNOWN = new Set<string>(LANGUAGES.map((l) => l.code));
/** Codes the phone reports for a language we file under another code. */
const ALIASES: Record<string, string> = { nb: 'no', nn: 'no', fil: 'tl', iw: 'he', in: 'id' };

/** The phone's first language that has a file here, or 'en'. */
export function deviceLanguage(): string {
  for (const l of getLocales()) {
    const raw = l.languageCode?.toLowerCase();
    const code = raw ? (ALIASES[raw] ?? raw) : null;
    if (code && KNOWN.has(code)) return code;
  }
  return 'en';
}

export const i18n = new I18n(translations);
i18n.defaultLocale = 'en';
i18n.enableFallback = true;
i18n.locale = deviceLanguage();

AppState.addEventListener('change', (s) => {
  if (s === 'active') i18n.locale = deviceLanguage();
});

/** Translate a key, e.g. tr('tabs.discover') or tr('onboarding.page', { n: 1, total: 4 }). */
export const tr = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);

export const isRtl = (code = i18n.locale) => LANGUAGES.some((l) => l.code === code && 'rtl' in l && l.rtl);
