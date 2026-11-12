/**
 * Keeps every tab of this browser in step with the ONE session cookie they share.
 *
 * - Each page tells this module which user it was rendered for (`bindTabToUser`, via SessionSync).
 *   apiFetch sends that id in TAB_USER_HEADER, so a stale tab can never act as whoever signed in
 *   later: the server answers 409 SESSION_CHANGED and the tab reloads.
 * - Signing in, signing out and the demo reset tell the other tabs to reload at once.
 *   One channel object per tab: a BroadcastChannel never receives its own messages,
 *   so the tab that announces is not reloaded by itself.
 */

const CHANNEL_NAME = 'session';

let boundUser: string | null = null;
let channel: BroadcastChannel | null = null;

function sessionChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

export function bindTabToUser(userId: string | null): void {
  boundUser = userId;
}

/** The user this tab's page was rendered for, or null on /login. */
export function tabUserId(): string | null {
  return boundUser;
}

/** Call after this tab signed in, signed out or reset the demo. */
export function announceSessionChange(): void {
  sessionChannel()?.postMessage('changed');
}

/** Run `listener` when ANOTHER tab announces a change. Returns the unsubscribe function. */
export function onSessionChangeElsewhere(listener: () => void): () => void {
  const target = sessionChannel();
  if (!target) return () => undefined;
  const handler = () => listener();
  target.addEventListener('message', handler);
  return () => target.removeEventListener('message', handler);
}
