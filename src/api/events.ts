import type { AgentEvent, ModelGroup } from '../types';
import { DOCUMENT_STEPS, CODE_STEPS, GENERAL_STEPS } from '../types';
import { mockReply } from './orchestrator';
import { API_MODE, API_BASE } from './transport';
import {
  actor,
  getStore,
  updateStore,
  log,
  uid,
  subscribeStore,
} from './store';
import { resolveModel } from './tasks';
const documentEvents = [
  'task_started',
  'task_classified',
  'model_routed',
  'ocr_completed',
  'rag_search',
  'agent_reasoning',
  'document_generated',
  'task_completed',
];
const codeEvents = [
  'task_started',
  'task_classified',
  'model_routed',
  'model_inference',
  'sandbox_started',
  'test_passed',
  'test_passed',
  'task_completed',
];
const generalEvents = [
  'task_started',
  'task_classified',
  'model_routed',
  'agent_reasoning',
  'context_prepared',
  'model_inference',
  'response_generated',
  'task_completed',
];
/** Simulated backend scheduler. One timer per provider; independent of the current route. */
export function advanceMockTasks() {
  const data = getStore();
  if (data.settings.offline) return;
  let user;
  try {
    user = actor();
  } catch {
    return;
  }
  if (
    !data.tasks.some(
      (t) =>
        (t.status === 'running' || t.status === 'queued') &&
        (t.ownerId === user.id || user.role === 'admin'),
    )
  )
    return;
  updateStore((d) => {
    for (const task of d.tasks) {
      if (
        !['running', 'queued'].includes(task.status) ||
        (user.role !== 'admin' && task.ownerId !== user.id)
      )
        continue;
      const owner = d.users.find((u) => u.id === task.ownerId)!;
      if (!owner.enabled) continue;
      const step = task.step + 1;
      const group: ModelGroup =
        task.type === 'general'
          ? 'FAST'
          : task.type === 'code'
            ? 'MASTER'
            : step === 4
              ? 'LIBRARIAN'
              : step >= 5
                ? 'MASTER'
                : 'VISION';
      let failure = '';
      let fallback = false;
      try {
        if (!owner.modelAccess.includes(group))
          throw new Error(
            `Model group ${group} is not available to this operator.`,
          );
        const route = resolveModel(d, group);
        task.modelId = route.model.id;
        task.nodeId = route.node.id;
        fallback = route.fallback;
      } catch (e) {
        failure = (e as Error).message;
      }
      if (task.scenario === 'rag_failure' && step === 4)
        failure =
          'Local knowledge search could not be completed. The vector store did not respond.';
      if (task.scenario === 'sandbox_failure' && step === 5)
        failure =
          'Synthetic test failure: diameter must be positive. Exit code 1. Sandbox stopped.';
      const type = failure
        ? 'task_failed'
        : (task.type === 'document'
            ? documentEvents
            : task.type === 'code'
              ? codeEvents
              : generalEvents)[step];
      task.step = step;
      task.duration += 2;
      task.status = failure ? 'failed' : step === 7 ? 'completed' : 'running';
      task.error = failure || undefined;
      const event: AgentEvent = {
        id: uid('evt'),
        taskId: task.id,
        type,
        step: type,
        status: failure ? 'failed' : step === 7 ? 'completed' : 'running',
        message:
          failure ||
          (task.type === 'document'
            ? DOCUMENT_STEPS
            : task.type === 'code'
              ? CODE_STEPS
              : GENERAL_STEPS)[step] +
            (fallback ? ' · configured fallback selected' : ''),
        timestamp: new Date().toISOString(),
        model: d.models.find((m) => m.id === task.modelId)?.name,
      };
      task.events = task.events.map((e) => ({
        ...e,
        status: e.status === 'running' ? 'completed' : e.status,
      }));
      task.events.push(event);
      d.localRequests++;
      log(
        d,
        type.toUpperCase(),
        task.title,
        failure ? 'failed' : 'success',
        task.id,
        owner,
      );
      if (step === 7 && !failure) {
        task.reply = mockReply(task);
        task.tokens = 2400;
        owner.used += 2400;
        owner.monthlyUsed += 2400;
        owner.lastActivity = event.timestamp;
      }
    }
  });
}
export function startEventEngine() {
  if (API_MODE !== 'mock') return () => {};
  const timer = setInterval(advanceMockTasks, 1800);
  return () => clearInterval(timer);
}
export const taskEvents = {
  subscribe(
    taskId: string,
    onEvent: (event: AgentEvent) => void,
    onError?: (error: Error) => void,
  ) {
    if (API_MODE === 'http') {
      const source = new EventSource(
        `${API_BASE}/tasks/${encodeURIComponent(taskId)}/stream`,
        { withCredentials: true },
      );
      source.onmessage = (e) => {
        try {
          onEvent(JSON.parse(e.data));
        } catch {
          onError?.(new Error('Invalid task event.'));
        }
      };
      source.onerror = () =>
        onError?.(
          new Error('Task event connection interrupted; reconnecting.'),
        );
      return () => source.close();
    }
    let last = '';
    return subscribeStore(() => {
      const t = getStore().tasks.find((t) => t.id === taskId);
      let user;
      try {
        user = actor();
      } catch {
        return;
      }
      if (t && t.ownerId !== user.id && user.role !== 'admin') return;
      const event = t?.events.at(-1);
      if (event && event.id !== last) {
        last = event.id;
        onEvent(event);
      }
    });
  },
};
