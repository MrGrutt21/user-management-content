import { CLIENT_STATUS, type ClientStatus } from '@/domain/types';

export const CLIENT_STATUS_LABEL: Readonly<Record<ClientStatus, string>> = {
  [CLIENT_STATUS.ACTIVE]: 'Active',
  [CLIENT_STATUS.CHURNED]: 'Churned',
};

// Fixed locale and time zone: the server (detail page) and the browser (table) print the same date.
const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });

export function formatClientDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}
