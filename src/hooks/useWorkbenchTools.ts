import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { taskApi } from '../api/tasks';
/** Optional browser capability. No external calls or unsolicited actions. */
export function useWorkbenchTools() {
  const { user } = useApp();
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
    if (!context || !user) return;
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
          'Open the new-task form with a prompt. This stages a workflow; the operator must start it.',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            type: { type: 'string', enum: ['document', 'code'] },
          },
          required: ['prompt', 'type'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          if (
            !input ||
            typeof input !== 'object' ||
            !('prompt' in input) ||
            typeof input.prompt !== 'string' ||
            !('type' in input) ||
            !['document', 'code'].includes(String(input.type))
          )
            throw new Error('A prompt and a valid task type are required.');
          navigate('/workspace/new', {
            state: { prompt: input.prompt.slice(0, 8000), type: input.type },
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
  }, [user?.id, navigate]);
}
