import {
  ShieldCheck,
  Check,
  Radio,
  Waypoints,
  LockKeyhole,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { time } from './common';
import type { Task } from '../types';
export default function SovereigntyConsole({
  compact = false,
  task,
}: {
  compact?: boolean;
  task?: Task;
}) {
  const { data } = useApp();
  if (!data) return null;
  const model = data.models.find((m) => m.id === (task?.modelId ?? 'vision-1'));
  const node = data.nodes.find((n) => n.id === (task?.nodeId ?? model?.nodeId));
  const rule = data.routing.find((r) => r.group === model?.group);
  const fallback = data.models.find((m) => m.id === rule?.fallbackId);
  return (
    <aside className={`sovereignty-console ${compact ? 'compact' : ''}`}>
      <div className="console-head">
        <ShieldCheck size={18} />
        <span className="eyebrow">SOVEREIGNTY CONSOLE</span>
        <span className="live-label">
          <i />
          {task && !['running', 'queued'].includes(task.status)
            ? 'RECORDED'
            : 'LIVE'}
        </span>
      </div>
      <div className="console-network">
        <div>
          <span className="eyebrow">EXTERNAL CALLS</span>
          <strong>
            0<span>↗</span>
          </strong>
        </div>
        <div className="network-small">
          <LockKeyhole size={21} />
          <span>
            YOUR DATA.
            <br />
            YOUR BOUNDARY.
          </span>
        </div>
      </div>
      <div className="console-local">
        <span>
          <i />
          SOVEREIGN MODE
        </span>
        <span className="mono">AIR-GAPPED</span>
      </div>
      <div className="local-checks">
        {[
          'Local inference',
          'Local knowledge',
          'Local files',
          'Local execution',
        ].map((label) => (
          <div key={label}>
            <Check size={13} />
            {label}
          </div>
        ))}
      </div>
      <div className="local-requests">
        <span>LOCAL REQUESTS</span>
        <b>{data.localRequests.toString().padStart(2, '0')}</b>
        <span className="signal-line">
          <i />
        </span>
      </div>
      {!compact && (
        <>
          <div className="console-section">
            <div className="console-subhead">
              <Waypoints size={15} />
              <span>MODEL ROUTER</span>
            </div>
            <div className="route-flow">
              <span>TASK</span>
              <i />
              <span>ROUTER</span>
              <i />
              <span className="selected">{model?.group}</span>
            </div>
            <dl>
              <dt>SELECTED MODEL</dt>
              <dd>{model?.name}</dd>
              <dt>FALLBACK</dt>
              <dd>{fallback?.name}</dd>
              <dt>COMPUTE NODE</dt>
              <dd className="orange">{node?.name ?? 'Available local node'}</dd>
            </dl>
          </div>
          <div className="console-section">
            <div className="console-subhead">
              <Radio size={15} />
              <span>AGENT TRACE</span>
              <span className="console-tag">PUBLIC EVENTS</span>
            </div>
            <div className="trace-feed">
              {(task?.events.length
                ? task.events.slice(-6).map((e) => ({
                    id: e.id,
                    timestamp: e.timestamp,
                    action: e.type,
                    status: e.status,
                  }))
                : data.audit.slice(0, 6).reverse()
              ).map((e) => (
                <div
                  className={e.status === 'failed' ? 'trace-error' : ''}
                  key={e.id}
                >
                  <time>{time(e.timestamp)}</time>
                  <span>{e.action.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <p className="console-note">Execution summaries & tool events</p>
          </div>
        </>
      )}
      <div className="console-footer">
        <span className="status-dot" />
        NO DATA LEAVES THIS ENVIRONMENT
        <ShieldCheck size={13} />
      </div>
    </aside>
  );
}
