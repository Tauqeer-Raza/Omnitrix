import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  RefreshCw,
  ShieldCheck,
  Globe,
  Cpu,
  Database,
  ScanLine,
  Workflow,
  SquareCode,
  FileText,
  ScrollText,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { systemApi } from '../api/system';
import { API_MODE } from '../api/transport';
import { exportCSV } from '../api/exports';
import {
  Button,
  PageHeader,
  DataTable,
  SearchField,
  Picker,
  StatusBadge,
  dateTime,
  number,
} from '../components/common';
export function RunsPage() {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const tasks =
    data?.tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(query.toLowerCase()) &&
        (status === 'all' || t.status === status) &&
        (type === 'all' || t.type === type),
    ) ?? [];
  return (
    <>
      <PageHeader
        eyebrow="MONITORING / EXECUTION HISTORY"
        title="Agent runs"
        description="Every workflow, every step, every outcome. A complete local record."
      />
      <div className="runs-summary">
        {['completed', 'running', 'queued', 'failed'].map((s) => (
          <button
            className={status === s ? 'selected' : ''}
            key={s}
            onClick={() => setStatus(status === s ? 'all' : s)}
          >
            <StatusBadge status={s} />
            <b>{data?.tasks.filter((t) => t.status === s).length}</b>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search agent runs…"
        />
        <div className="toolbar-filters">
          <Picker
            label="Filter status"
            value={status}
            onChange={setStatus}
            options={['all', 'completed', 'running', 'queued', 'failed']}
          />
          <Picker
            label="Filter task type"
            value={type}
            onChange={setType}
            options={['all', 'document', 'code', 'general']}
          />
        </div>
      </div>
      <DataTable
        headers={['TASK', 'TYPE', 'STATUS', 'STARTED', 'DURATION', '']}
        rows={tasks.map((t) => ({
          id: t.id,
          cells: [
            <Link
              key="cell-0"
              to={`/workspace/chats/${t.conversationId ?? t.id}`}
            >
              <strong>{t.title}</strong>
              <small className="cell-subtitle mono">{t.id}</small>
            </Link>,
            <span key="cell-1" className="badge-outline">
              {t.type.toUpperCase()}
            </span>,
            <StatusBadge key="cell-2" status={t.status} />,
            <span key="cell-3" className="mono">
              {dateTime(t.started)}
            </span>,
            <span key="cell-4" className="mono">
              {t.duration}s
            </span>,
            <Link
              key="cell-5"
              className="text-link"
              to={`/workspace/chats/${t.conversationId ?? t.id}`}
            >
              Open chat
              <ArrowUpRight size={14} />
            </Link>,
          ],
        }))}
      />
    </>
  );
}
export function AuditPage({ admin = false }: { admin?: boolean }) {
  const { data } = useApp();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [action, setAction] = useState('all');
  const [date, setDate] = useState('');
  const [task, setTask] = useState(params.get('task') ?? 'all');
  const [page, setPage] = useState(1);
  const events = (data?.audit ?? []).filter(
    (e) =>
      (!query ||
        `${e.action} ${e.resource} ${e.actor}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (status === 'all' || e.status === status) &&
      (action === 'all' || e.action === action) &&
      (!date || e.timestamp.slice(0, 10) === date) &&
      (task === 'all' || e.taskId === task),
  );
  const pages = Math.max(1, Math.ceil(events.length / 12));
  const current = Math.min(page, pages);
  return (
    <>
      <PageHeader
        eyebrow={
          admin
            ? 'SECURITY / ORGANIZATION-WIDE RECORD'
            : 'MONITORING / YOUR ACTIVITY'
        }
        title={admin ? 'Audit logs' : 'Audit log'}
        description="Traceable actions. Local records. Full operational accountability."
        action={
          <Button
            disabled={!events.length}
            onClick={() =>
              exportCSV(
                events.map((e) => ({
                  timestamp: e.timestamp,
                  actor: e.actor,
                  action: e.action,
                  resource: e.resource,
                  status: e.status,
                  audit_id: e.id,
                })),
                `omnitrix-audit-${new Date().toISOString().slice(0, 10)}.csv`,
              )
            }
          >
            <Download size={15} />
            Export CSV
          </Button>
        }
      />
      <div className="audit-notice">
        <ShieldCheck size={18} />
        <span>Audit logging active</span>
        <span className="mono">
          {number(data?.audit.length ?? 0)} EVENTS · LOCAL DATABASE
        </span>
      </div>
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search actions, resources or actors…"
        />
        <div className="toolbar-filters">
          <input
            className="date-filter"
            type="date"
            aria-label="Filter audit date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Picker
            label="Filter action"
            value={action}
            onChange={setAction}
            options={[
              'all',
              ...Array.from(new Set(data?.audit.map((a) => a.action))),
            ]}
          />
          <Picker
            label="Filter status"
            value={status}
            onChange={setStatus}
            options={['all', 'success', 'failed', 'info']}
          />
        </div>
      </div>
      {!admin && (
        <div className="audit-task-filter">
          <span className="eyebrow">TASK</span>
          <Picker
            value={task}
            onChange={setTask}
            label="Filter audit task"
            options={[
              { value: 'all', label: 'All tasks' },
              ...(data?.tasks.map((t) => ({ value: t.id, label: t.title })) ??
                []),
            ]}
          />
        </div>
      )}
      <DataTable
        headers={
          admin
            ? ['TIMESTAMP', 'ACTOR', 'ACTION', 'RESOURCE', 'STATUS']
            : ['TIMESTAMP', 'ACTION', 'TASK / RESOURCE', 'STATUS']
        }
        rows={events.slice((current - 1) * 12, current * 12).map((e) => ({
          id: e.id,
          cells: [
            <span key="cell-0" className="mono">
              {dateTime(e.timestamp)}
            </span>,
            ...(admin ? [e.actor] : []),
            <span key="cell-2" className="audit-action">
              {e.action}
            </span>,
            e.taskId ? (
              <Link key="cell-3" to={`/workspace/runs/${e.taskId}`}>
                {e.resource}
              </Link>
            ) : (
              e.resource
            ),
            <StatusBadge key="cell-4" status={e.status} />,
          ],
        }))}
      />
      <div className="pagination">
        <span>{events.length} matching events</span>
        <div>
          <Button
            disabled={current <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span>
            {current} / {pages}
          </span>
          <Button
            disabled={current >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <p className="note">
        {API_MODE === 'http'
          ? 'Audit records are persisted in the control-plane SQL database. This view includes the latest 1,000 events.'
          : 'Demo audit records are browser-local. Tamper-resistant retention and authorization belong to the production backend.'}
      </p>
    </>
  );
}
export function SystemPage({ security = false }: { security?: boolean }) {
  const { data, act, refresh } = useApp();
  if (!data) return null;
  const offline = data.settings.offline;
  const services =
    API_MODE === 'http'
      ? [
          [
            'Backend API',
            Workflow,
            'Authenticated control-plane connection',
            'online',
          ],
          [
            'Inference workers',
            Cpu,
            `${data.nodes.filter((n) => n.status === 'online' && n.id !== 'control-plane').length} nodes marked online; availability checked when dispatched`,
            'configured',
          ],
          [
            'Document index',
            Database,
            `${data.documents.reduce((s, d) => s + d.chunks, 0)} persisted chunks`,
            'local',
          ],
          [
            'Code generation',
            SquareCode,
            'Code is returned for review; automatic execution is not enabled',
            'review',
          ],
          [
            'Document Generator',
            FileText,
            'Word / PDF / Excel / PowerPoint output',
            'online',
          ],
          [
            'Audit Database',
            ScrollText,
            `${data.audit.length} recent SQL event records`,
            'online',
          ],
        ]
      : [
          [
            'AI Models',
            Cpu,
            `${data.models.filter((m) => m.enabled).length} / ${data.models.length} enabled`,
            data.models.some((m) => m.enabled) ? 'online' : 'offline',
          ],
          ['OCR Engine', ScanLine, 'Local vision pipeline', 'online'],
          [
            'Vector Store',
            Database,
            `${data.documents.reduce((s, d) => s + d.chunks, 0)} indexed chunks`,
            'online',
          ],
          [
            'Agent Orchestrator',
            Workflow,
            'Task planning & tool coordination',
            'online',
          ],
          [
            'Execution Sandbox',
            SquareCode,
            'Network isolation enabled',
            'online',
          ],
          [
            'Document Generator',
            FileText,
            'Word / PDF output adapters',
            'online',
          ],
          [
            'Audit Database',
            ScrollText,
            `${data.audit.length} local event records`,
            'online',
          ],
        ];
  return (
    <>
      <PageHeader
        eyebrow={
          security
            ? 'SECURITY / SOVEREIGN BOUNDARY'
            : 'SYSTEM / LIVE DIAGNOSTICS'
        }
        title={security ? 'Security status' : 'System status'}
        description="A complete view of the services inside your local environment."
        action={
          <Button onClick={() => void act(refresh, 'System status refreshed')}>
            <RefreshCw size={15} />
            Refresh status
          </Button>
        }
      />
      <div className={`system-operational ${offline ? 'warning' : ''}`}>
        <ShieldCheck size={34} />
        <div>
          <span className="eyebrow">LOCAL ENVIRONMENT</span>
          <h2>
            {API_MODE === 'http'
              ? offline
                ? 'Processing paused'
                : 'Control plane connected'
              : offline
                ? 'Local backend offline'
                : 'System operational'}
          </h2>
          <p>
            {API_MODE === 'http'
              ? 'Worker availability is checked during dispatch. Hardware and network measurements are not configured.'
              : offline
                ? 'Workflows are paused until the local mock service is restored.'
                : 'All core services are available. No external inference connections.'}
          </p>
        </div>
        {offline ? (
          <Button
            primary
            onClick={() =>
              void act(() => systemApi.reconnect(), 'Local backend reconnected')
            }
          >
            {API_MODE === 'http'
              ? 'Resume processing'
              : 'Reconnect demo backend'}
          </Button>
        ) : (
          <StatusBadge status="online" />
        )}
      </div>
      <div className="system-layout">
        <section className="service-list">
          {services.map(([name, Icon, detail, status]) => {
            const I = Icon as typeof Cpu;
            return (
              <div key={String(name)} className="service-row">
                <span className="service-icon">
                  <I size={20} />
                </span>
                <div>
                  <h3>{String(name)}</h3>
                  <p>{String(detail)}</p>
                </div>
                <span className="service-latency mono">
                  {offline || API_MODE === 'http' ? '—' : '< 20 ms'}
                </span>
                <StatusBadge status={offline ? 'offline' : String(status)} />
              </div>
            );
          })}
        </section>
        <div className="security-boundary dark-panel panel">
          <div className="section-title">
            <ShieldCheck size={15} />
            LOCAL SYSTEM BOUNDARY
          </div>
          <div className="boundary-network">
            <div className="boundary-center">OMNITRIX</div>
            {[
              'MODEL',
              'KNOWLEDGE',
              'FILES',
              'TOOLS',
              API_MODE === 'http' ? 'ROUTER' : 'SANDBOX',
              'AUDIT',
            ].map((x, i) => (
              <span key={x} className={`boundary-node node-${i}`}>
                {x}
              </span>
            ))}
          </div>
          <div className="external-stat">
            <span>EXTERNAL CONNECTIONS</span>
            <strong>{API_MODE === 'http' ? '—' : '0'}</strong>
            <Globe size={25} />
          </div>
          <div className="boundary-local">
            <span>
              {API_MODE === 'http'
                ? 'RECORDED MODEL CALLS'
                : 'LOCAL CONNECTIONS'}
            </span>
            <b>{data.localRequests}</b>
          </div>
          <p className="note">
            {API_MODE === 'http'
              ? 'Service configuration and SQL records are shown here. Network isolation must be established and verified at the gateway and LAN.'
              : 'These are simulated service and network diagnostics. Production monitoring must report measurements from the local backend.'}
          </p>
        </div>
      </div>
      <div className="three-columns system-node-summary">
        {data.nodes.map((n) => (
          <div className="panel" key={n.id}>
            <div className="section-heading">
              <span className="eyebrow">{n.name}</span>
              <StatusBadge status={n.status} />
            </div>
            <p>
              {n.type} · {n.memory} GB memory
            </p>
            <span className="mono">{n.host}</span>
          </div>
        ))}
      </div>
    </>
  );
}
