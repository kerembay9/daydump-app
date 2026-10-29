/**
 * "Open with PicDump" (ACTION_VIEW/EDIT image/*) arrives as a content:// or file:// URL, which is not a route:
 * send it to Create. The images themselves are read from the intent by AppState (getInitialShareIntent).
 *
 * The experiment screens (selfie, people, today-tags) are reachable from Profile > Developer tools in debug builds only;
 * in a release build a picdump:// link to them goes to Discover.
 */
export const DEV_ONLY_ROUTES = /^\/(selfie|people|today-tags)(\/|\?|$)/;

export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  if (path && /^(content|file):/.test(path)) return '/create';
  if (!__DEV__ && path && DEV_ONLY_ROUTES.test(path)) return '/';
  return path;
}
