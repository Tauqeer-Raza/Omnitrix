import type {
  Database,
  Settings,
  ComputeNode,
  ProviderHealth,
} from '../types';
import { API_MODE, endpoint } from './transport';
import { mockReply } from './orchestrator';
import {
  actor,
  authorize,
  getStore,
  updateStore,
  log,
  uid,
  ApiError,
} from './store';
export const systemApi = {
  getStatus: () =>
    endpoint<Database>(
      'GET',
      '/system/snapshot',
      undefined,
      () => {
        const user = actor();
        const data = structuredClone(getStore());
        data.tasks = data.tasks.map((task) =>
          task.status === 'completed' && !task.reply
            ? { ...task, reply: mockReply(task) }
            : task,
        );
        if (user.role !== 'admin') {
          data.users = data.users.filter((u) => u.id === user.id);
          data.tasks = data.tasks.filter((t) => t.ownerId === user.id);
          data.audit = data.audit.filter((a) => a.actorId === user.id);
          data.documents = data.documents.filter(
            (d) => d.ownerId === user.id || d.knowledge,
          );
        }
        return data;
      },
      true,
    ),
  updateSettings: (settings: Partial<Settings>) =>
    endpoint(
      'PATCH',
      '/system/settings',
      API_MODE === 'http'
        ? Object.fromEntries(
            Object.entries(settings).filter(([key]) =>
              [
                'organization',
                'dailyLimit',
                'monthlyLimit',
                'retentionDays',
                'timeout',
                'offline',
                'departmentLimits',
                'requireReview',
              ].includes(key),
            ),
          )
        : settings,
      () => {
        authorize('admin');
        if (
          (settings.dailyLimit !== undefined && settings.dailyLimit < 1000) ||
          (settings.monthlyLimit !== undefined && settings.monthlyLimit < 1000)
        )
          throw new ApiError(
            'VALIDATION',
            'Resource limits must be at least 1,000 tokens.',
          );
        updateStore((d) => {
          Object.assign(d.settings, settings);
          log(d, 'SETTINGS_CHANGED', 'Organization policies');
        });
        return getStore().settings;
      },
      true,
    ),
  checkProviders: () =>
    endpoint<ProviderHealth[]>(
      'GET',
      '/system/providers/health',
      undefined,
      () => {
        const data = getStore();
        const checkedAt = new Date().toISOString();
        const modelHealth = data.models.map((model) => {
          const node = data.nodes.find((entry) => entry.id === model.nodeId);
          const configured = model.configured ?? model.enabled;
          const online = configured && model.enabled && node?.status === 'online';
          return {
            id: model.id,
            group: model.group,
            nodeId: model.nodeId,
            model: model.servedModel ?? model.name,
            endpointHost: model.endpointHost ?? node?.host ?? '',
            status: configured
              ? online
                ? ('online' as const)
                : ('offline' as const)
              : ('unconfigured' as const),
            modelAvailable: !!online,
            latencyMs: online ? 12 : null,
            advertisedModels: online
              ? [model.servedModel ?? model.name]
              : [],
            checkedAt,
            detail: online
              ? 'The simulated local registry is available.'
              : 'This simulated model slot is unavailable.',
          };
        });
        return [
          {
            id: 'orchestrator',
            group: 'ORCHESTRATOR' as const,
            nodeId: 'control-plane',
            model: data.orchestrator?.model ?? 'Demo orchestrator',
            endpointHost: data.orchestrator?.endpointHost ?? 'localhost',
            status: 'online' as const,
            modelAvailable: true,
            latencyMs: 8,
            advertisedModels: [
              data.orchestrator?.model ?? 'Demo orchestrator',
            ],
            checkedAt,
            detail: 'The simulated orchestrator registry is available.',
          },
          ...modelHealth,
        ];
      },
      true,
    ),
  reconnect: () =>
    endpoint(
      'POST',
      '/system/reconnect',
      {},
      () => {
        actor();
        updateStore((d) => {
          d.settings.offline = false;
          log(d, 'BACKEND_RECONNECTED', 'Local mock service');
        });
      },
      true,
    ),
  registerNode: (
    node: Omit<ComputeNode, 'id' | 'activeTasks' | 'utilization'>,
  ) =>
    endpoint('POST', '/nodes', node, () => {
      authorize('admin');
      if (
        !node.name.trim() ||
        !node.host.trim() ||
        node.memory <= 0 ||
        node.capacity <= 0
      )
        throw new ApiError(
          'VALIDATION',
          'Provide a name, address, positive memory and capacity.',
        );
      const entry = {
        ...node,
        id: uid('node'),
        activeTasks: 0,
        utilization: 0,
      };
      updateStore((d) => {
        d.nodes.push(entry);
        log(d, 'NODE_REGISTERED', node.name);
      });
      return entry;
    }),
  updateNode: (id: string, patch: Partial<ComputeNode>) =>
    endpoint('PATCH', `/nodes/${id}`, patch, () => {
      authorize('admin');
      updateStore((d) => {
        const n = d.nodes.find((n) => n.id === id);
        if (!n) throw new ApiError('NOT_FOUND', 'Node not found.');
        Object.assign(n, patch);
        log(d, 'NODE_UPDATED', n.name);
      });
    }),
};
