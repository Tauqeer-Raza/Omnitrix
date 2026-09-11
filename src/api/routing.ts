import type { RoutingRule } from '../types';
import { endpoint } from './transport';
import { authorize, getStore, updateStore, log, ApiError } from './store';
export const routingApi = {
  getRouting: () =>
    endpoint('GET', '/routing', undefined, () => {
      authorize('tasks');
      return getStore().routing;
    }),
  update: (id: string, patch: Partial<RoutingRule>) =>
    endpoint(
      'PATCH',
      `/routing/${id}`,
      Object.fromEntries(
        Object.entries(patch).filter(([key]) =>
          ['primaryId', 'fallbackId', 'strategy'].includes(key),
        ),
      ),
      () => {
        authorize('admin');
        const old = getStore().routing.find((r) => r.id === id);
        if (!old) throw new ApiError('NOT_FOUND', 'Routing rule not found.');
        const next = { ...old, ...patch };
        if (next.primaryId === next.fallbackId)
          throw new ApiError(
            'VALIDATION',
            'Primary and fallback models must be different.',
          );
        if (
          [next.primaryId, next.fallbackId].some(
            (id) =>
              !getStore().models.some(
                (m) => m.id === id && m.group === old.group,
              ),
          )
        )
          throw new ApiError(
            'VALIDATION',
            'Both models must belong to this model group.',
          );
        updateStore((d) => {
          Object.assign(
            d.routing.find((r) => r.id === id)!,
            next,
          );
          log(d, 'ROUTING_CHANGED', old.task);
        });
        return next;
      },
    ),
};
