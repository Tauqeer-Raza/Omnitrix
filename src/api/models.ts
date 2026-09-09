import type { Model } from '../types';
import { endpoint } from './transport';
import { authorize, getStore, updateStore, log, ApiError } from './store';
export const modelApi = {
  getModels: () =>
    endpoint('GET', '/models', undefined, () => {
      authorize('tasks');
      return getStore().models;
    }),
  update: (
    id: string,
    patch: Partial<
      Pick<Model, 'enabled' | 'priority' | 'nodeId' | 'role' | 'context'>
    >,
  ) =>
    endpoint('PATCH', `/models/${id}`, patch, () => {
      authorize('admin');
      if (
        patch.priority !== undefined &&
        (!Number.isInteger(patch.priority) ||
          patch.priority < 1 ||
          patch.priority > 10)
      )
        throw new ApiError('VALIDATION', 'Priority must be 1–10.');
      if (patch.nodeId && !getStore().nodes.some((n) => n.id === patch.nodeId))
        throw new ApiError('VALIDATION', 'Select a registered node.');
      updateStore((d) => {
        const m = d.models.find((m) => m.id === id);
        if (!m) throw new ApiError('NOT_FOUND', 'Model not found.');
        Object.assign(m, patch);
        log(
          d,
          patch.enabled === false
            ? 'MODEL_DISABLED'
            : patch.enabled === true
              ? 'MODEL_ENABLED'
              : 'MODEL_UPDATED',
          m.name,
        );
      });
      return getStore().models.find((m) => m.id === id)!;
    }),
};
