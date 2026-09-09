import { useState } from 'react';
import { LoaderCircle, ChevronDown, Check } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { Task } from '../types';
import { useApp } from '../state/AppContext';
import SovereigntyConsole from './SovereigntyConsole';

export function activityLabel(task: Task) {
  if (task.status === 'queued') return 'Getting started';
  if (task.status === 'failed') return 'This request needs attention';
  if (task.status === 'completed') return 'Your response is ready';
  if (task.step < 2) return 'Understanding your request';
  if (task.step < 4)
    return task.type === 'document'
      ? 'Reading your document'
      : 'Choosing the right local tools';
  if (task.step < 6)
    return task.type === 'code'
      ? 'Checking the calculation'
      : task.type === 'document'
        ? 'Reviewing the findings'
        : 'Preparing your response';
  return 'Finishing up';
}
export default function ChatActivity({ task }: { task: Task }) {
  const [details, setDetails] = useState(false);
  const { data } = useApp();
  const running = ['running', 'queued'].includes(task.status);
  const paused = !!data?.settings.offline;
  return (
    <aside className="chat-activity" aria-label="Task activity">
      <div className="chat-activity-intro">
        <span className="eyebrow">WORKING LOCALLY</span>
        <h2>
          {paused
            ? 'Waiting for connection'
            : running
              ? 'On it.'
              : task.status === 'completed'
                ? 'All done.'
                : 'Let’s try again.'}
        </h2>
        <p>
          {paused
            ? 'Your request will resume when the local service reconnects.'
            : running
              ? 'Omnitrix is choosing the tools and preparing your response.'
              : 'Your execution details are available below.'}
        </p>
      </div>
      <div className="chat-progress">
        <div role="status" aria-live="polite">
          {running && !paused ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Check size={17} />
          )}
          <span>{paused ? 'Local service paused' : activityLabel(task)}</span>
        </div>
        <Progress
          value={Math.max(4, Math.min(100, (task.step + 1) * 12.5))}
          aria-label="Request progress"
        />
        <div className="chat-progress-steps">
          {['Understand', 'Process', 'Respond'].map((label, i) => (
            <span key={label} className={task.step >= i * 3 ? 'reached' : ''}>
              <i />
              {label}
            </span>
          ))}
        </div>
      </div>
      <SovereigntyConsole compact task={task} />
      <button
        className="chat-trace-toggle"
        aria-expanded={details}
        onClick={() => setDetails((v) => !v)}
      >
        <span>Technical details</span>
        <ChevronDown
          size={14}
          style={{ transform: details ? 'rotate(180deg)' : undefined }}
        />
      </button>
      {details && (
        <div className="chat-technical-details">
          <p>
            <b>Selected model</b>
            {data?.models.find((m) => m.id === task.modelId)?.name}
          </p>
          <p>
            <b>Compute node</b>
            {data?.nodes.find((n) => n.id === task.nodeId)?.name}
          </p>
          {task.events.slice(-5).map((event) => (
            <p key={event.id}>{event.message}</p>
          ))}
        </div>
      )}
    </aside>
  );
}
