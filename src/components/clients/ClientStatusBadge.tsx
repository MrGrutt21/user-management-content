import { CLIENT_STATUS, type ClientStatus } from '@/domain/types';

import { CLIENT_STATUS_LABEL } from './client-format';

/** No hooks or handlers, so both the client table and the server-rendered detail page can use it. */
export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span className={status === CLIENT_STATUS.CHURNED ? 'badge inactive' : 'badge'}>{CLIENT_STATUS_LABEL[status]}</span>
  );
}
