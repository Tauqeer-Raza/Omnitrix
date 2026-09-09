import { endpoint } from './transport';
import { authorize, getStore } from './store';
export const auditApi = {
  getAudit: () =>
    endpoint('GET', '/audit', undefined, () => {
      const user = authorize('audit');
      return getStore().audit.filter(
        (a) => user.role === 'admin' || a.actorId === user.id,
      );
    }),
};
