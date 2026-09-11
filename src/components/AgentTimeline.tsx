import { Check, LoaderCircle, Circle, AlertTriangle } from 'lucide-react';
import type { Task } from '../types';
import { CODE_STEPS, DOCUMENT_STEPS, GENERAL_STEPS } from '../types';
import { API_MODE } from '../api/transport';

export default function AgentTimeline({ task }: { task: Task }) {
  if (API_MODE === 'http' && task.plan?.steps.length)
    return (
      <ol className="agent-timeline">
        {task.plan.steps.map((step, index) => {
          const event = [...task.events]
            .reverse()
            .find((entry) => entry.planStepId === step.id);
          const state =
            task.status === 'failed' && index === task.step
              ? 'failed'
              : task.status === 'completed' || index < task.step
                ? 'completed'
                : index === task.step
                  ? 'running'
                  : 'idle';
          return (
            <li key={step.id} className={'step-' + state}>
              <span className="timeline-state">
                {state === 'failed' ? (
                  <AlertTriangle size={13} />
                ) : state === 'running' ? (
                  <LoaderCircle size={13} className="spin" />
                ) : state === 'completed' ? (
                  <Check size={13} />
                ) : (
                  <Circle size={10} />
                )}
              </span>
              <div>
                <b>{step.label}</b>
                <p>{event?.message ?? step.description}</p>
                {(step.tool || step.modelGroup) && (
                  <small className="mono">
                    {[step.tool, step.modelGroup].filter(Boolean).join(' · ')}
                  </small>
                )}
              </div>
              <span>
                {state === 'running'
                  ? 'LIVE'
                  : event
                    ? new Date(event.timestamp).toLocaleTimeString()
                    : String(index + 1).padStart(2, '0')}
              </span>
            </li>
          );
        })}
      </ol>
    );
  if (API_MODE === 'http')
    return (
      <ol className="agent-timeline">
        {task.events
          .filter((event) => event.type !== 'response_delta')
          .map((event, index, events) => {
            const state =
              event.status === 'failed'
                ? 'failed'
                : index === events.length - 1 &&
                    !['completed', 'failed'].includes(task.status)
                  ? 'running'
                  : 'completed';
            return (
              <li key={event.id} className={'step-' + state}>
                <span className="timeline-state">
                  {state === 'failed' ? (
                    <AlertTriangle size={13} />
                  ) : state === 'running' ? (
                    <LoaderCircle size={13} className="spin" />
                  ) : (
                    <Check size={13} />
                  )}
                </span>
                <div>
                  <b>{event.type.replaceAll('_', ' ')}</b>
                  <p>{event.message}</p>
                </div>
                <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
              </li>
            );
          })}
      </ol>
    );
  const steps =
    task.type === 'code'
      ? CODE_STEPS
      : task.type === 'general'
        ? GENERAL_STEPS
        : DOCUMENT_STEPS;
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
          <li key={step} className={'step-' + state}>
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
                ? String((i + 1) * 2) + 's'
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
