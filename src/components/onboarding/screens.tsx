import React, { useEffect, useState } from 'react';
import { Alert, Platform, Text, ToastAndroid, View } from 'react-native';
import { Image } from 'expo-image';
import Check from 'lucide-react-native/icons/check';
import { useTheme } from '../../theme/ThemeProvider';
import { caps, display, label, ui } from '../../theme/type';
import { Icons } from '../ui/Icons';
import { Card, Shell } from './Shell';
import { Pic, PrintSpec, PrintStack, SAMPLE, usePic } from './Prints';
import { RevenueCatService } from '../../services/revenuecat';
import { dateSpan, librarySize, type Access } from '../../services/onboardingFlow';
import { useOnboardingFlow, type LibraryStats } from '../../state/OnboardingFlow';
import { fixed } from '../../theme/tokens';
import { getLocale, tr } from '../../i18n';

type Nav = { onNext: () => void; onBack?: () => void };

const notify = (m: string) => (Platform.OS === 'android' ? ToastAndroid.show(m, ToastAndroid.SHORT) : Alert.alert(m));

/** 1 · Welcome */
export function HookScreen({ onNext }: Nav) {
  const restore = async () => {
    const res = await RevenueCatService.restorePurchases().catch((e) => ({ isPro: false, error: String(e) }));
    notify(res.isPro ? tr('onboarding.flow.restored') : res.error ?? tr('onboarding.flow.noSubscription'));
  };
  const sep12 = new Date(new Date().getFullYear(), 8, 12).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
  const prints: PrintSpec[] = [
    { x: 8, y: 52, w: 150, h: 184, r: -6.5, bg: SAMPLE[1] },
    { x: 186, y: 40, w: 148, h: 180, r: 6, bg: SAMPLE[2] },
    { x: 26, y: 206, w: 112, h: 112, r: 4, bg: SAMPLE[3] },
    { x: 84, y: 22, w: 180, h: 226, r: -1.5, bg: SAMPLE[4], bw: 5, tape: true, chip: sep12 },
  ];
  return (
    <Shell eyebrow={tr('onboarding.hook.badge')} headline={tr('onboarding.hook.title')} justify="flex-end"
      primary={{ label: tr('onboarding.flow.getStarted'), onPress: onNext }} links={[{ label: tr('onboarding.flow.restore'), onPress: restore }]}
      above={<PrintStack prints={prints} height={330} rotate={-1} />} />
  );
}

/** 2 · Promise: three prints slide into one dump */
export function PromiseScreen({ onNext, onBack }: Nav) {
  const { t } = useTheme();
  const prints: PrintSpec[] = [
    { x: 4, y: 26, w: 84, h: 104, r: -7, bg: SAMPLE[0] },
    { x: 46, y: 96, w: 86, h: 106, r: 5, bg: SAMPLE[2] },
    { x: 10, y: 140, w: 72, h: 84, r: -3, bg: SAMPLE[1] },
    { x: 198, y: 30, w: 140, h: 176, r: -1, bg: SAMPLE[0], bw: 5, tape: true, cells: [SAMPLE[0], SAMPLE[2], SAMPLE[1], SAMPLE[4]], chip: tr('onboarding.flow.promise.dumpChip') },
  ];
  return (
    <Shell onBack={onBack} headline={tr('onboarding.flow.promise.title')} sub={tr('onboarding.flow.promise.sub')} justify="center" primary={{ label: tr('common.continue'), onPress: onNext }}
      above={(
        <PrintStack prints={prints} height={240}>
          <View style={{ position: 'absolute', left: 148, top: 98, width: 40, height: 40, borderRadius: 20, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icons.arrow size={18} color={t.ink} />
          </View>
        </PrintStack>
      )} />
  );
}

/** 3 · Privacy first */
export function PrivacyScreen({ onNext, onBack }: Nav) {
  const { t } = useTheme();
  const rows = [
    ['never', 'neverSub'], ['noAccount', 'noAccountSub'], ['noTracking', 'noTrackingSub'],
  ] as const;
  return (
    <Shell onBack={onBack} headline={tr('onboarding.flow.privacy.title')} leadIn={tr('onboarding.flow.privacy.leadIn')} primary={{ label: tr('common.continue'), onPress: onNext }}>
      <View style={{ gap: 8, marginTop: 8 }}>
        {rows.map(([title, sub]) => (
          <Card key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={16} color={t.bgScreen} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ui(13, 600), { color: t.ink }]}>{tr(`onboarding.flow.privacy.${title}`)}</Text>
              <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr(`onboarding.flow.privacy.${sub}`)}</Text>
            </View>
          </Card>
        ))}
      </View>
    </Shell>
  );
}

/** 4 · Photo access: our reason first, then the OS dialog */
export function AccessScreen({ onAsk, onBack, busy }: { onAsk: () => void; onBack?: () => void; busy: boolean }) {
  const { t } = useTheme();
  return (
    <Shell onBack={onBack} busy={busy} eyebrow={tr('onboarding.flow.access.eyebrow')} headline={tr('onboarding.flow.access.title')} sub={tr('onboarding.flow.access.sub')}
      primary={{ label: tr('onboarding.flow.access.cta'), onPress: onAsk }}>
      <Card style={{ marginTop: 12, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.bgScreen, borderWidth: 1, borderColor: t.borderSubtle, alignItems: 'center', justifyContent: 'center' }}>
            <Icons.image size={20} color={t.ink} />
          </View>
          <Text style={[display(16.5), { color: t.ink, flex: 1 }]}>{tr('onboarding.flow.access.primerTitle')}</Text>
        </View>
        {(['primer1', 'primer2', 'primer3'] as const).map((k) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ marginTop: 1 }}><Check size={16} color={t.ink} strokeWidth={1.75} /></View>
            <Text style={[ui(12), { color: t.ink, lineHeight: 17, flex: 1 }]}>{tr(`onboarding.flow.access.${k}`)}</Text>
          </View>
        ))}
      </Card>
    </Shell>
  );
}

/** 4b · Limited access, or none: PicDump still works */
export function LimitedScreen({ access, shared, onSettings, onContinue }: { access: Access | null; shared: number | null; onSettings: () => void; onContinue: () => void }) {
  const { t } = useTheme();
  const limited = access === 'limited';
  const pic = usePic();
  const cells = [pic(0), pic(1), pic(2), pic(3)];
  return (
    <Shell headline={tr('onboarding.flow.limited.title')} sub={tr(limited ? 'onboarding.flow.limited.subLimited' : 'onboarding.flow.limited.subNone')}
      primary={{ label: tr('onboarding.flow.limited.openSettings'), onPress: onSettings }}
      secondary={{ label: tr(limited ? 'onboarding.flow.limited.continueSelected' : 'onboarding.flow.limited.continueWithout'), onPress: onContinue }}>
      <Card style={{ marginTop: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 84, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {cells.map((bg, i) => <Pic key={i} bg={bg} style={{ width: 40, height: 40, borderRadius: 4, opacity: limited ? 1 : 0.25 }} />)}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[ui(13, 600), { color: t.ink }]}>{limited && shared != null ? tr('onboarding.flow.limited.sharedTitle', { count: shared.toLocaleString(getLocale()) }) : tr('onboarding.flow.limited.noneTitle')}</Text>
          <Text style={[ui(11, 500), { color: t.inkMuted }]}>{tr('onboarding.flow.limited.settingsHint')}</Text>
        </View>
      </Card>
    </Shell>
  );
}

/** 5 · Library count, from the photos the OS let us see */
/** The scan plays at least this long, and gives up waiting for the photos or the count after the cap. */
const SCAN_MIN_MS = 3600;
const SCAN_MAX_MS = 6000;
const FLIP_MS = 120;

/** Screen 5's first beat: random photos from the library flick through a print while the count climbs to the real total. */
function Scan({ reel, total, done }: { reel: string[]; total: number | null; done: () => void }) {
  const { t } = useTheme();
  const [tick, setTick] = useState(0);
  const [t0] = useState(Date.now); // the clock keeps running when the count or the photos arrive
  useEffect(() => {
    const id = setInterval(() => {
      const ms = Date.now() - t0;
      setTick(ms);
      if (ms >= SCAN_MAX_MS || (ms >= SCAN_MIN_MS && total != null && reel.length)) done();
    }, FLIP_MS);
    return () => clearInterval(id);
  }, [t0, reel.length, total, done]);
  const shown = total == null ? 0 : Math.round(total * (1 - Math.pow(1 - Math.min(1, tick / SCAN_MIN_MS), 3)));
  const uri = reel.length ? reel[Math.floor(tick / FLIP_MS) % reel.length] : null;
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <View style={{ width: 190, height: 238, borderWidth: 5, borderColor: fixed.printBorder, borderRadius: 8, overflow: 'hidden', backgroundColor: t.borderStrong, transform: [{ rotate: '-2deg' }] }}>
        {uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" /> : null}
      </View>
      <Text style={[display(30, 1), { color: t.ink, fontVariant: ['tabular-nums'] }]}>{shown.toLocaleString(getLocale())}</Text>
    </View>
  );
}

export function LibraryScreen({ access, stats, onNext }: { access: Access | null; stats: LibraryStats | null; onNext: () => void }) {
  const { t } = useTheme();
  const { reel, scanned, markScanned } = useOnboardingFlow();
  // no photos to flick through (Expo Go, nothing readable): no scan
  const scanning = !scanned && access !== null && access !== 'denied';
  const pick = usePic();
  const prints: PrintSpec[] = [
    { x: 90, y: 28, w: 96, h: 118, r: -7, bg: pick(0) },
    { x: 156, y: 24, w: 96, h: 118, r: 6, bg: pick(1) },
    { x: 118, y: 14, w: 106, h: 132, r: -1, bg: pick(2), tape: true },
  ];
  const size = stats ? librarySize(stats.count, access) : null;
  const count = stats?.count.toLocaleString(getLocale()) ?? '';
  const headline = !size ? tr('onboarding.flow.library.counting') : tr(`onboarding.flow.library.${size}`, { count });
  const sub = size ? tr(`onboarding.flow.library.${{ large: 'subLarge', mid: 'subMid', small: 'subSmall', limited: 'subLimited' }[size]}`) : undefined;
  const rows = stats ? [
    ...(size === 'limited' ? [{ k: tr('onboarding.flow.library.shared'), v: tr('onboarding.flow.library.sharedValue', { count }) }] : []),
    { k: tr('onboarding.flow.library.dateSpan'), v: dateSpan(stats.oldest, stats.newest, getLocale()) },
  ] : [];
  if (scanning) {
    return <Shell headline={tr('onboarding.flow.library.scanning')} primary={{ label: tr('common.continue'), onPress: onNext, disabled: true }} justify="center"><Scan reel={reel} total={stats?.count ?? null} done={markScanned} /></Shell>;
  }
  return (
    <Shell headline={headline} sub={sub} primary={{ label: tr('common.continue'), onPress: onNext }} above={<PrintStack prints={prints} height={170} />}>
      {rows.length ? (
        <Card>
          {rows.map((r, i) => (
            <View key={r.k} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 3, borderTopWidth: i ? 1 : 0, borderTopColor: t.borderSubtle }}>
              <Text style={[label(10, 0.14), { color: t.inkMuted }]}>{caps(r.k)}</Text>
              <Text style={[ui(13, 600), { color: t.ink }]}>{r.v}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Shell>
  );
}
