/**
 * All tabs of a browser share ONE session cookie. A tab therefore tells the server which user
 * its page was rendered for, in this header, on every API call (src/lib/api-client.ts). If the
 * cookie now belongs to someone else (another tab signed out and in again), the server refuses
 * with SESSION_CHANGED instead of acting as that other account, and the tab reloads.
 */
export const TAB_USER_HEADER = 'x-tab-user-id';
