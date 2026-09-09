import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  FileText,
  SquareCode,
  ShieldCheck,
  Cpu,
  Activity,
  Globe,
  Paperclip,
  CornerDownLeft,
  Command,
  Clock3,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import {
  Button,
  MetricCard,
  Counter,
  SectionHeading,
  StatusBadge,
  ResourceMeter,
  PageHeader,
  time,
} from '../components/common';
import Core from '../components/Core';
import SovereigntyConsole from '../components/SovereigntyConsole';
export default function Dashboard() {
  const { data, user } = useApp();
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<'document' | 'code'>('document');
  const navigate = useNavigate();
  if (!data || !user) return null;
  const start = () => navigate('/workspace/new', { state: { prompt, type } });
  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS / OVERVIEW"
        title="Good morning, operator."
        description="Secure AI workspace for confidential industrial operations."
        action={
          <Button primary onClick={() => navigate('/workspace/new')}>
            <Plus size={17} />
            New task
            <ArrowUpRight size={17} />
          </Button>
        }
      />
      <div className="dashboard-metrics">
        <MetricCard
          label="LOCAL SYSTEM"
          value={
            <span className="secure-value">
              Secure <ShieldCheck size={25} />
            </span>
          }
          detail="All security checks passed"
          icon={<ShieldCheck size={16} />}
        />
        <MetricCard
          label="MODELS ONLINE"
          value={
            <>
              <Counter value={data.models.filter((m) => m.enabled).length} />
              <small> / {data.models.length}</small>
            </>
          }
          detail="Across 4 model groups"
          icon={<Cpu size={16} />}
        />
        <MetricCard
          label="TASKS TODAY"
          value={<Counter value={data.tasks.length} />}
          detail={`${data.tasks.filter((t) => t.status === 'running').length} currently running`}
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="EXTERNAL CALLS"
          value={<Counter value={0} />}
          detail="Your network. Your data."
          icon={<Globe size={16} />}
          orange
        />
      </div>
      <div className="dashboard-middle">
        <section className="command-workspace">
          <div className="workspace-heading">
            <span className="eyebrow">
              <span className="orange-square" />
              AI WORKSPACE
            </span>
            <span className="mono">
              READY TO EXECUTE <i className="status-dot" />
            </span>
          </div>
          <div className="workspace-intro">
            <div className="workspace-copy">
              <span className="chapter-label">
                01 / INTELLIGENCE, CONTAINED.
              </span>
              <h2>
                Complex work.
                <br />
                <span>Under your control.</span>
              </h2>
              <p>
                From confidential documents to
                <br />
                critical calculations. All local.
              </p>
              <div className="workspace-trust">
                <ShieldCheck size={14} />
                SELF-HOSTED <i /> AUDIT-LOGGED
              </div>
            </div>
            <Core />
          </div>
          <div className="command-input">
            <div className="task-type-switch">
              <button
                className={type === 'document' ? 'selected' : ''}
                onClick={() => setType('document')}
              >
                <FileText size={14} />
                Document task
              </button>
              <button
                className={type === 'code' ? 'selected' : ''}
                onClick={() => setType('code')}
              >
                <SquareCode size={14} />
                Coding task
              </button>
            </div>
            <textarea
              aria-label="Task request"
              placeholder="What would you like to accomplish?"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') start();
              }}
            />
            <div className="command-actions">
              <button className="attach-button" onClick={start}>
                <Paperclip size={15} />
                Attach documents
              </button>
              <div>
                <span className="mono keyboard-hint">⌘ ↵</span>
                <Button
                  primary
                  className="command-submit"
                  onClick={start}
                  aria-label="Create task from prompt"
                >
                  <ArrowUpRight size={19} />
                </Button>
              </div>
            </div>
          </div>
        </section>
        <SovereigntyConsole compact />
      </div>
      <div className="dashboard-bottom">
        <section className="recent-tasks">
          <SectionHeading
            label="RECENT TASKS"
            action={
              <Link className="text-link" to="/workspace/runs">
                View all
                <ArrowUpRight size={14} />
              </Link>
            }
          />
          <div className="task-table-head">
            <span>TASK / WORKFLOW</span>
            <span>STATUS</span>
            <span />
          </div>
          {data.tasks.slice(0, 4).map((t) => (
            <Link
              className="task-row"
              key={t.id}
              to={`/workspace/${t.type === 'code' ? 'code' : 'runs'}/${t.id}`}
            >
              <span className={`task-icon ${t.type}`}>
                {t.type === 'code' ? (
                  <SquareCode size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </span>
              <div className="task-row-title">
                <b>{t.title}</b>
                <small>
                  {t.type.toUpperCase()}
                  <i />
                  {t.id.toUpperCase()}
                </small>
              </div>
              <StatusBadge status={t.status} />
              <ChevronRight size={15} />
            </Link>
          ))}
        </section>
        <section className="activity-resource">
          <SectionHeading
            label="SYSTEM ACTIVITY"
            action={
              <span className="live-text">
                <i />
                LIVE FEED
              </span>
            }
          />
          <div className="activity-feed">
            {data.audit.slice(0, 4).map((a) => (
              <div key={a.id}>
                <span className="activity-line-dot" />
                <time>{time(a.timestamp)}</time>
                <span>{a.action}</span>
              </div>
            ))}
          </div>
          <ResourceMeter used={user.used} total={user.dailyLimit} />
        </section>
      </div>
    </>
  );
}
