/**
 * "Open with PicDump" (ACTION_VIEW/EDIT image/*) arrives as a content:// or file:// URL, which is not a route:
 * send it to Create. The images themselves are read from the intent by AppState (getInitialShareIntent).
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  if (path && /^(content|file):/.test(path)) return '/create';
  return path;
}
