// App text: tr('section.key'). en.json is the source; every other language file in locales/ starts empty and falls back to English
// until it is translated. The language follows the phone (on Android it follows a change when the app comes back to the front).
import { useMemo, useSyncExternalStore } from 'react';
import { AppState, I18nManager } from 'react-native';
import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';
import { LANGUAGES } from './languages';
import { translations } from './translations';

I18nManager.allowRTL(true);

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

const listeners = new Set<() => void>();

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLocaleChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.warn('[i18n] listener failed:', e);
    }
  });
}

export function setLocale(code: string): void {
  i18n.locale = code;
  notifyLocaleChange();
}

export const getLocale = (): string => i18n.locale;

AppState.addEventListener('change', (s) => {
  if (s === 'active') {
    const next = deviceLanguage();
    if (next !== i18n.locale) {
      setLocale(next);
    }
  }
});

/** Translate a key, e.g. tr('tabs.discover') or tr('onboarding.page', { n: 1, total: 4 }). */
export const tr = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);

export const isRtl = (code: string = i18n.locale): boolean => {
  const norm = (code || i18n.locale || 'en').split(/[-_]/)[0]?.toLowerCase();
  const resolved = norm ? (ALIASES[norm] ?? norm) : 'en';
  return LANGUAGES.some((l) => l.code === resolved && 'rtl' in l && Boolean(l.rtl));
};

export function useLocale(): string {
  return useSyncExternalStore(subscribeLocale, () => i18n.locale, () => 'en');
}

export interface UseTranslationReturn {
  (key: string, options?: Record<string, unknown>): string;
  tr(key: string, options?: Record<string, unknown>): string;
  t(key: string, options?: Record<string, unknown>): string;
  locale: string;
  isRtl: boolean;
}

export function useTranslation(): UseTranslationReturn {
  const locale = useLocale();
  return useMemo(() => {
    return Object.assign(
      (key: string, options?: Record<string, unknown>) => tr(key, options),
      {
        tr,
        t: tr,
        locale,
        isRtl: isRtl(locale),
      }
    ) as UseTranslationReturn;
  }, [locale]);
}
