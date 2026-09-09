import type { Task, Scenario, ModelGroup, Database } from '../types';
import { endpoint } from './transport';
import { classifyPrompt } from './orchestrator';
import {
  authorize,
  own,
  getStore,
  updateStore,
  log,
  uid,
  ApiError,
} from './store';
export function resolveModel(data: Database, group: ModelGroup) {
  const rule = data.routing.find((r) => r.group === group);
  if (!rule)
    throw new ApiError('MODEL_UNAVAILABLE', 'No routing rule is configured.');
  for (const id of [rule.primaryId, rule.fallbackId]) {
    const model = data.models.find((m) => m.id === id && m.enabled);
    if (!model) continue;
    const assigned = data.nodes.find(
      (n) =>
        n.id === model.nodeId &&
        n.status === 'online' &&
        n.activeTasks < n.capacity,
    );
    const node =
      assigned ??
      data.nodes
        .filter((n) => n.status === 'online' && n.activeTasks < n.capacity)
        .sort((a, b) =>
          rule.strategy === 'least_loaded' ? a.utilization - b.utilization : 0,
        )[0];
    if (node) return { model, node, fallback: id !== rule.primaryId };
  }
  throw new ApiError(
    'MODEL_UNAVAILABLE',
    'No configured model and available compute node can accept this task. Ask an administrator to check Models and Compute Nodes.',
  );
}
export function checkAllocation(data: Database, userId: string, cost = 2400) {
  const user = data.users.find((u) => u.id === userId)!;
  const reserved = data.tasks.filter(
    (t) => t.status === 'running' || t.status === 'queued',
  );
  const personal = reserved.filter((t) => t.ownerId === userId).length * 2400;
  const total =
    data.users.reduce((s, u) => s + u.used, 0) + reserved.length * 2400;
  const department = data.users.filter((u) => u.department === user.department);
  const departmentUsed =
    department.reduce((s, u) => s + u.used, 0) +
    reserved.filter((t) => department.some((u) => u.id === t.ownerId)).length *
      2400;
  if (
    user.used + personal + cost > user.dailyLimit ||
    user.monthlyUsed + personal + cost > user.monthlyLimit ||
    total + cost > data.settings.dailyLimit ||
    data.users.reduce((s, u) => s + u.monthlyUsed, 0) +
      reserved.length * 2400 +
      cost >
      data.settings.monthlyLimit ||
    departmentUsed + cost >
      (data.settings.departmentLimits[user.department] ?? Infinity)
  )
    throw new ApiError(
      'RESOURCE_LIMIT',
      'Your AI resource allocation has been exhausted. Request additional resources from your administrator.',
    );
}
export const taskApi = {
  createTask: (input: {
    prompt: string;
    type?: 'document' | 'code' | 'general';
    documentIds: string[];
    scenario: Scenario;
    title?: string;
    conversationId?: string;
  }) =>
    endpoint<Task>('POST', '/tasks', input, () => {
      const user = authorize('tasks');
      const history = input.conversationId
        ? getStore()
            .tasks.filter(
              (t) => (t.conversationId ?? t.id) === input.conversationId,
            )
            .sort((a, b) => a.started.localeCompare(b.started))
        : [];
      if (input.conversationId) {
        if (!history.length)
          throw new ApiError(
            'NOT_FOUND',
            'This conversation is no longer available.',
          );
        own(history[0].ownerId, 'tasks');
        if (history.some((t) => ['running', 'queued'].includes(t.status)))
          throw new ApiError(
            'IN_PROGRESS',
            'Please wait for the current response before sending another message.',
          );
      }
      const previous = history.at(-1);
      const documentIds = input.documentIds.length
        ? input.documentIds
        : (previous?.documentIds ?? []);
      const type =
        input.type ?? classifyPrompt(input.prompt, documentIds, previous);
      if (type !== 'general') authorize(type === 'code' ? 'code' : 'documents');
      if (input.prompt.trim().length < (input.type ? 12 : 1))
        throw new ApiError(
          'VALIDATION',
          input.type
            ? 'Describe your task in at least 12 characters.'
            : 'Write a message to get started.',
        );
      if (input.prompt.length > 8000)
        throw new ApiError(
          'VALIDATION',
          'Keep your task under 8,000 characters.',
        );
      if (type === 'document' && !documentIds.length)
        throw new ApiError(
          'VALIDATION',
          'Attach at least one document or choose the sample report.',
        );
      for (const id of documentIds) {
        const doc = getStore().documents.find((d) => d.id === id);
        if (!doc)
          throw new ApiError(
            'NOT_FOUND',
            'An attachment is no longer available.',
          );
        own(doc.ownerId, 'documents');
      }
      const required: ModelGroup[] =
        type === 'document'
          ? ['VISION', 'MASTER', 'LIBRARIAN']
          : type === 'code'
            ? ['MASTER']
            : ['FAST'];
      if (required.some((g) => !user.modelAccess.includes(g)))
        throw new ApiError(
          'FORBIDDEN',
          'Your model access does not allow this workflow. Contact your administrator.',
        );
      checkAllocation(getStore(), user.id);
      const { model, node } = resolveModel(getStore(), required[0]);
      const task: Task = {
        id: uid('tsk'),
        title:
          input.title?.trim() ||
          input.prompt
            .trim()
            .split(/[.!?\n]/)[0]
            .slice(0, 64),
        prompt: input.prompt.trim(),
        type,
        ownerId: user.id,
        documentIds,
        status: 'queued',
        step: -1,
        started: new Date().toISOString(),
        duration: 0,
        events: [],
        modelId: model.id,
        nodeId: node.id,
        tokens: 0,
        scenario: input.scenario,
      };
      task.conversationId = input.conversationId ?? task.id;
      updateStore((d) => {
        d.tasks.unshift(task);
        log(d, 'TASK_CREATED', task.title, 'success', task.id);
      });
      return task;
    }),
  getTask: (id: string) =>
    endpoint('GET', `/tasks/${id}`, undefined, () => {
      const t = getStore().tasks.find((t) => t.id === id);
      if (!t) throw new ApiError('NOT_FOUND', 'Task not found.');
      own(t.ownerId, 'tasks');
      return t;
    }),
  getTaskEvents: (id: string) =>
    endpoint('GET', `/tasks/${id}/events`, undefined, () => {
      const t = getStore().tasks.find((t) => t.id === id);
      if (!t) throw new ApiError('NOT_FOUND', 'Task not found.');
      own(t.ownerId, 'tasks');
      return t.events;
    }),
  retry: (id: string) =>
    endpoint('POST', `/tasks/${id}/retry`, {}, () => {
      const t = getStore().tasks.find((t) => t.id === id);
      if (!t) throw new ApiError('NOT_FOUND', 'Task not found.');
      own(t.ownerId, 'tasks');
      if (t.status !== 'failed')
        throw new ApiError(
          'VALIDATION',
          'Only stopped or failed requests can be retried.',
        );
      const history = getStore()
        .tasks.filter(
          (item) =>
            (item.conversationId ?? item.id) === (t.conversationId ?? t.id),
        )
        .sort((a, b) => a.started.localeCompare(b.started));
      if (
        history.at(-1)?.id !== id ||
        history.some((item) => ['running', 'queued'].includes(item.status))
      )
        throw new ApiError(
          'IN_PROGRESS',
          'Continue from the latest message in this conversation.',
        );
      checkAllocation(getStore(), t.ownerId);
      resolveModel(
        getStore(),
        t.type === 'code' ? 'MASTER' : t.type === 'general' ? 'FAST' : 'VISION',
      );
      updateStore((d) => {
        const t = d.tasks.find((t) => t.id === id)!;
        Object.assign(t, {
          status: 'queued',
          step: -1,
          events: [],
          error: undefined,
          scenario: 'normal',
          started: new Date().toISOString(),
          duration: 0,
        });
        log(d, 'TASK_RETRIED', t.title, 'success', id);
      });
    }),
  cancel: (id: string) =>
    endpoint('POST', `/tasks/${id}/cancel`, {}, () => {
      const t = getStore().tasks.find((t) => t.id === id);
      if (!t) throw new ApiError('NOT_FOUND', 'Task not found.');
      own(t.ownerId, 'tasks');
      if (!['queued', 'running'].includes(t.status))
        throw new ApiError('VALIDATION', 'Only active tasks can be cancelled.');
      updateStore((d) => {
        const task = d.tasks.find((t) => t.id === id)!;
        task.status = 'failed';
        task.error = 'Task cancelled by the operator.';
        log(d, 'TASK_CANCELLED', task.title, 'info', id);
      });
    }),
};
