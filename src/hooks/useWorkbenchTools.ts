import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { taskApi } from '../api/tasks';
/** Optional browser capability. No external calls or unsolicited actions. */
export function useWorkbenchTools() {
  const { user } = useApp();
  const userId = user?.id;
  const navigate = useNavigate();
  useEffect(() => {
    type Tool = {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context || !userId) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'omnitrix_get_task',
        description:
          'Read an authorized local task and its public execution events.',
        inputSchema: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input) => {
          if (
            !input ||
            typeof input !== 'object' ||
            !('taskId' in input) ||
            typeof input.taskId !== 'string'
          )
            throw new Error('taskId must be a string.');
          const task = await taskApi.getTask(input.taskId);
          return {
            id: task.id,
            title: task.title,
            status: task.status,
            events: task.events,
          };
        },
      },
      {
        name: 'omnitrix_start_task_creation',
        description:
          'Open a new chat with a message. This stages the message; the operator must send it. The orchestrator selects the tools.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
          },
          required: ['prompt'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          if (
            !input ||
            typeof input !== 'object' ||
            !('prompt' in input) ||
            typeof input.prompt !== 'string'
          )
            throw new Error('A message is required.');
          void navigate('/workspace/new', {
            state: { prompt: input.prompt.slice(0, 8000) },
          });
          return { staged: true, created: false };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [userId, navigate]);
}
