import { Check, LoaderCircle, Circle, AlertTriangle } from 'lucide-react';
import type { Task } from '../types';
import { CODE_STEPS, DOCUMENT_STEPS } from '../types';
export default function AgentTimeline({ task }: { task: Task }) {
  const steps = task.type === 'code' ? CODE_STEPS : DOCUMENT_STEPS;
  return (
    <ol className="agent-timeline">
      {steps.map((step, i) => {
        const state =
          task.status === 'failed' && i === task.step
            ? 'failed'
            : task.status === 'completed' || i < task.step
              ? 'completed'
              : i === task.step
                ? 'running'
                : 'idle';
        return (
          <li key={step} className={`step-${state}`}>
            <span className="timeline-state">
              {state === 'completed' ? (
                <Check size={13} />
              ) : state === 'running' ? (
                <LoaderCircle size={13} className="spin" />
              ) : state === 'failed' ? (
                <AlertTriangle size={13} />
              ) : (
                <Circle size={10} />
              )}
            </span>
            <div>
              <b>{step}</b>
              {state === 'running' && (
                <p>
                  {task.events.at(-1)?.message ?? 'Waiting for local worker…'}
                </p>
              )}
              {state === 'completed' && i === 2 && (
                <p>Route selected from local model registry</p>
              )}
            </div>
            <span>
              {state === 'completed'
                ? `${(i + 1) * 2}s`
                : state === 'running'
                  ? 'LIVE'
                  : state === 'failed'
                    ? 'FAILED'
                    : String(i + 1).padStart(2, '0')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
