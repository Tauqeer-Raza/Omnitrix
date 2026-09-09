import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Cpu,
  Activity,
  Gauge,
  Globe,
  ArrowUpRight,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../state/AppContext';
import {
  PageHeader,
  MetricCard,
  Counter,
  SectionHeading,
  StatusBadge,
  ResourceMeter,
  Picker,
  number,
  time,
} from '../../components/common';
import Core from '../../components/Core';
export function UsageChart({ period = '24 hours' }: { period?: string }) {
  const { data } = useApp();
  const use = data?.users.reduce((s, u) => s + u.used, 0) ?? 0;
  const points = (
    period === '7 days'
      ? [0.2, 0.37, 0.32, 0.61, 0.45, 0.77, 0.65]
      : [
          0.1, 0.13, 0.11, 0.18, 0.17, 0.25, 0.23, 0.26, 0.21, 0.38, 0.32, 0.42,
          0.62, 0.57, 0.43, 0.61, 0.52, 0.69, 0.61, 0.82, 0.73, 0.86, 0.79, 1,
        ]
  ).map((n) => Math.round(use * n));
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${30 + i * (640 / (points.length - 1))} ${170 - (p / use) * 130}`,
    )
    .join(' ');
  return (
    <div className="usage-chart">
      <div className="chart-y mono">
        <span>{number(use)}</span>
        <span>{number(Math.round(use / 2))}</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 700 205"
        role="img"
        aria-label={`Synthetic token usage over ${period}, ending at ${number(use)} tokens`}
      >
        <defs>
          <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#ff7e47" stopOpacity=".3" />
            <stop offset="1" stopColor="#ff7e47" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 105, 170].map((y) => (
          <line
            key={y}
            x1="30"
            x2="670"
            y1={y}
            y2={y}
            stroke="#b7c0a3"
            strokeDasharray="3 5"
            strokeWidth=".7"
          />
        ))}
        <path d={`${path} L 670 180 L 30 180 Z`} fill="url(#usageFill)" />
        <path d={path} stroke="#db8a57" strokeWidth="2.5" fill="none" />
        <circle
          cx="670"
          cy="40"
          r="4"
          fill="#ff7e47"
          stroke="#f4f0e4"
          strokeWidth="3"
        />
        {(period === '7 days'
          ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
          : ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'NOW']
        ).map((x, i) => (
          <text
            x={30 + i * 106}
            y="200"
            fontFamily="Consolas,monospace"
            fontSize="9"
            fill="#8a9675"
            textAnchor={i === 6 ? 'end' : 'start'}
            key={x}
          >
            {x}
          </text>
        ))}
      </svg>
    </div>
  );
}
export default function AdminDashboard() {
  const { data } = useApp();
  const [period, setPeriod] = useState('24 hours');
  if (!data) return null;
  const usage = data.users.reduce((s, u) => s + u.used, 0);
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION / ORGANIZATIONAL OVERVIEW"
        title="Control center"
        description="Manage AI infrastructure, resources and organizational policies."
        action={
          <Link className="glass-button" to="/admin/nodes">
            <Server size={15} />
            Manage infrastructure
            <ArrowUpRight size={15} />
          </Link>
        }
      />
      <div className="admin-metrics">
        <MetricCard
          label="TOTAL MODELS"
          value={<Counter value={data.models.length} />}
          detail="4 specialized groups"
          icon={<Boxes size={16} />}
        />
        <MetricCard
          label="MODELS ONLINE"
          value={
            <Counter value={data.models.filter((m) => m.enabled).length} />
          }
          detail="Local model registry"
          icon={<Cpu size={16} />}
        />
        <MetricCard
          label="ACTIVE TASKS"
          value={
            <Counter
              value={
                data.tasks.filter((t) =>
                  ['running', 'queued'].includes(t.status),
                ).length
              }
            />
          }
          detail="Across your organization"
          icon={<Activity size={16} />}
        />
        <MetricCard
          label="TOKENS USED"
          value={
            <>
              {(usage / 1000).toFixed(1)}
              <small>k</small>
            </>
          }
          detail="Current daily allocation"
          icon={<Gauge size={16} />}
        />
        <MetricCard
          label="EXTERNAL CALLS"
          value="0"
          detail="Sovereignty maintained"
          icon={<Globe size={16} />}
          orange
        />
      </div>
      <div className="admin-overview-main">
        <section className="panel usage-panel">
          <SectionHeading
            label="RESOURCE USAGE"
            action={
              <Picker
                value={period}
                onChange={setPeriod}
                options={['24 hours', '7 days']}
                label="Usage period"
              />
            }
          />
          <div className="usage-headline">
            <h2>
              {number(usage)}
              <small>tokens consumed</small>
            </h2>
            <span className="mono">SYNTHETIC HISTORY / LIVE TOTAL</span>
          </div>
          <UsageChart period={period} />
          <div className="usage-bottom">
            <span>
              <i />
              Token usage
            </span>
            <span>
              Daily capacity <b>{number(data.settings.dailyLimit)}</b>
            </span>
            <Link className="text-link" to="/admin/resources">
              View resources
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </section>
        <section className="admin-core-panel dark-panel">
          <div className="admin-core-header">
            <span className="eyebrow">INFRASTRUCTURE, ORCHESTRATED.</span>
            <ShieldCheck size={18} />
          </div>
          <Core />
          <div className="admin-core-stats">
            <span>
              <strong>{data.nodes.length}</strong>COMPUTE NODES
            </span>
            <span>
              <strong>4</strong>MODEL GROUPS
            </span>
            <span>
              <strong>0</strong>EXTERNAL CALLS
            </span>
          </div>
          <Link to="/admin/routing">
            Inspect model routing
            <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
      <div className="admin-bottom">
        <section>
          <SectionHeading
            label="COMPUTE INFRASTRUCTURE"
            action={
              <Link className="text-link" to="/admin/nodes">
                All nodes
                <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="admin-node-list">
            {data.nodes.map((n) => (
              <Link to="/admin/nodes" className="mini-node" key={n.id}>
                <Server size={20} />
                <div>
                  <b>{n.name}</b>
                  <small>{n.type}</small>
                </div>
                <div className="mini-util">
                  <span style={{ width: `${n.utilization}%` }} />
                </div>
                <span className="mono">{n.utilization}%</span>
                <StatusBadge status={n.status} />
              </Link>
            ))}
          </div>
        </section>
        <section>
          <SectionHeading
            label="GOVERNANCE ACTIVITY"
            action={
              <Link className="text-link" to="/admin/audit">
                Audit logs
                <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div className="admin-audit">
            {data.audit.slice(0, 5).map((a) => (
              <div key={a.id}>
                <time>{time(a.timestamp)}</time>
                <div>
                  <b>{a.action}</b>
                  <small>
                    {a.actor} · {a.resource}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
export function ResourcesPage() {
  const { data } = useApp();
  const [period, setPeriod] = useState('24 hours');
  if (!data) return null;
  const usage = data.users.reduce((s, u) => s + u.used, 0);
  return (
    <>
      <PageHeader
        eyebrow="CONTROL CENTER / CAPACITY"
        title="Resource usage"
        description="Understand consumption across models, compute nodes and departments."
      />
      <div className="dashboard-metrics">
        <MetricCard
          label="TOKEN USAGE"
          value={`${(usage / 1000).toFixed(1)}k`}
          detail="Current day"
          icon={<Gauge size={15} />}
        />
        <MetricCard
          label="COMPUTE UTILIZATION"
          value={`${Math.round(data.nodes.reduce((s, n) => s + n.utilization, 0) / Math.max(1, data.nodes.length))}%`}
          detail="Across registered nodes"
          icon={<Cpu size={15} />}
        />
        <MetricCard
          label="ACTIVE TASKS"
          value={data.tasks.filter((t) => t.status === 'running').length}
          detail="Executing locally"
          icon={<Activity size={15} />}
        />
        <MetricCard
          label="LOCAL REQUESTS"
          value={data.localRequests}
          detail="No external requests"
          icon={<Server size={15} />}
          orange
        />
      </div>
      <section className="panel">
        <SectionHeading
          label="TOKEN CONSUMPTION"
          action={
            <Picker
              value={period}
              onChange={setPeriod}
              options={['24 hours', '7 days']}
              label="Chart period"
            />
          }
        />
        <UsageChart period={period} />
        <p className="note">
          Historical distribution is synthetic; the current total reflects demo
          task completion.
        </p>
      </section>
      <div className="two-columns resource-breakdown">
        <section className="panel">
          <SectionHeading label="DEPARTMENT ALLOCATION" />
          {Object.entries(data.settings.departmentLimits).map(
            ([name, limit]) => (
              <div className="department-usage" key={name}>
                <h3>{name}</h3>
                <ResourceMeter
                  label="DAILY TOKENS"
                  used={data.users
                    .filter((u) => u.department === name)
                    .reduce((s, u) => s + u.used, 0)}
                  total={limit}
                />
              </div>
            ),
          )}
        </section>
        <section className="panel">
          <SectionHeading label="COMPUTE CAPACITY" />
          {data.nodes.map((n) => (
            <div className="department-usage" key={n.id}>
              <div className="section-heading">
                <h3>{n.name}</h3>
                <StatusBadge status={n.status} />
              </div>
              <div className="progress-caption">
                <span>
                  {n.activeTasks} active tasks / {n.capacity} capacity
                </span>
                <b>{n.utilization}%</b>
              </div>
              <div className="capacity-track">
                <i style={{ width: `${n.utilization}%` }} />
              </div>
              <p className="note">
                {n.memory} GB memory · {n.accelerator}
              </p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
