import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import type { LucideIcon } from 'lucide-react-native';
import ArrowRight from 'lucide-react-native/icons/arrow-right';
import Bookmark from 'lucide-react-native/icons/bookmark';
import Camera from 'lucide-react-native/icons/camera';
import Check from 'lucide-react-native/icons/check';
import CircleDashed from 'lucide-react-native/icons/circle-dashed';
import Clapperboard from 'lucide-react-native/icons/clapperboard';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Clock from 'lucide-react-native/icons/clock';
import Trash from 'lucide-react-native/icons/trash';
import Copy from 'lucide-react-native/icons/copy';
import Crop from 'lucide-react-native/icons/crop';
import Download from 'lucide-react-native/icons/download';
import GalleryHorizontal from 'lucide-react-native/icons/gallery-horizontal';
import Heart from 'lucide-react-native/icons/heart';
import Lock from 'lucide-react-native/icons/lock';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import ImageIcon from 'lucide-react-native/icons/image';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import MoreHorizontal from 'lucide-react-native/icons/ellipsis';
import Music from 'lucide-react-native/icons/music';
import Pencil from 'lucide-react-native/icons/pencil';
import Search from 'lucide-react-native/icons/search';
import Send from 'lucide-react-native/icons/send';
import Settings from 'lucide-react-native/icons/settings';
import Sparkle from 'lucide-react-native/icons/sparkle';
import User from 'lucide-react-native/icons/user';
import X from 'lucide-react-native/icons/x';
import { useTheme } from '../../theme/ThemeProvider';

/** All icons: 24 viewBox, 1.75 stroke, round caps (mock icon system). Color defaults to ink. */
export type IconProps = { size?: number; color?: string; fill?: string };

function Custom({ size = 18, color, children }: IconProps & { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? t.ink} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

/** Discover tab: double nested ornamental frame. */
export const FancyFrame = (p: IconProps) => (
  <Custom {...p}>
    <Rect x={3} y={3} width={18} height={18} rx={3} />
    <Rect x={6.8} y={6.8} width={10.4} height={10.4} rx={1.5} />
    <Path d="M3 7.5h2.2M7.5 3v2.2M21 7.5h-2.2M16.5 3v2.2M3 16.5h2.2M7.5 21v-2.2M21 16.5h-2.2M16.5 21v-2.2" />
  </Custom>
);

/** Create tab: two tilted frames with rays above. */
export const CreateRays = (p: IconProps) => (
  <Custom {...p}>
    <Rect x={5.5} y={10.2} width={8.2} height={8.2} rx={1.6} transform="rotate(-15 9.6 14.3)" />
    <Rect x={10.2} y={9.8} width={8.2} height={8.2} rx={1.6} transform="rotate(14 14.3 13.9)" />
    <Path d="M12 2.2v3M6.8 3.8l1.6 2.4M17.2 3.8l-1.6 2.4M3.2 7.5l2.6 1.2M20.8 7.5l-2.6 1.2" />
  </Custom>
);

/** Library tab: tilted frame + pencil nib. */
export const WorkspaceEdit = (p: IconProps) => (
  <Custom {...p}>
    <Rect x={4.5} y={7.5} width={9.5} height={9.5} rx={1.6} transform="rotate(-18 9.25 12.25)" />
    <Path d="m14.2 13.8 5.2-5.2 2.3 2.3-5.2 5.2-3.1.8.8-3.1Z" />
    <Path d="m18 9.9 2.3 2.3" />
  </Custom>
);

/** Tidy tab: a frame with a check, a second frame peeling off behind it. */
export const FrameCheck = (p: IconProps) => (
  <Custom {...p}>
    <Path d="M8 4.5h10.5a2 2 0 0 1 2 2V17" />
    <Rect x={3.5} y={7.5} width={13} height={13} rx={2} />
    <Path d="m7 14.2 2.6 2.5 4.4-5" />
  </Custom>
);

/** Mock's two-arc refresh (re-roll). */
export const Refresh = (p: IconProps) => (
  <Custom {...p}>
    <Path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4" />
    <Path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />
  </Custom>
);

const lucide = (C: LucideIcon) => {
  const Icon = ({ size = 18, color, fill }: IconProps) => {
    const { t } = useTheme();
    return <C size={size} color={color ?? t.ink} fill={fill ?? 'none'} strokeWidth={1.75} />;
  };
  Icon.displayName = C.displayName;
  return Icon;
};

export const Icons = {
  search: lucide(Search),
  edit: lucide(Pencil),
  arrow: lucide(ArrowRight),
  back: lucide(ChevronLeft),
  chevron: lucide(ChevronRight),
  clock: lucide(Clock),
  lock: lucide(Lock),
  trash: lucide(Trash),
  close: lucide(X),
  settings: lucide(Settings),
  user: lucide(User),
  heart: lucide(Heart),
  comment: lucide(MessageCircle),
  send: lucide(Send),
  bookmark: lucide(Bookmark),
  camera: lucide(Camera),
  music: lucide(Music),
  download: lucide(Download),
  check: lucide(Check),
  carousel: lucide(GalleryHorizontal),
  story: lucide(CircleDashed),
  reel: lucide(Clapperboard),
  crop: lucide(Crop),
  sparkle: lucide(Sparkle),
  copy: lucide(Copy),
  image: lucide(ImageIcon),
  expand: lucide(Maximize2),
  more: lucide(MoreHorizontal),
  refresh: Refresh,
  fancyFrame: FancyFrame,
  createRays: CreateRays,
  workspaceEdit: WorkspaceEdit,
};
