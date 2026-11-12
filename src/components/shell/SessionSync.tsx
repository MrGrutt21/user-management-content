'use client';

import { useEffect } from 'react';

import { bindTabToUser, onSessionChangeElsewhere } from '@/lib/session-tab';

/**
 * Rendered by every page with the user it was rendered for (null on /login). Binds this tab to
 * that user for apiFetch, and reloads the tab when another tab signs in, out or resets the demo,
 * so the page always shows the account the browser is really signed in as.
 */
export function SessionSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    bindTabToUser(userId);
    return onSessionChangeElsewhere(() => window.location.reload());
  }, [userId]);
  return null;
}
