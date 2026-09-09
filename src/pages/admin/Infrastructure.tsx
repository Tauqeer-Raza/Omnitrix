import { useState, type FormEvent } from 'react';
import {
  Cpu,
  ChevronDown,
  ChevronUp,
  Save,
  Plus,
  Server,
  GitBranch,
  ArrowRight,
  ArrowDown,
  Boxes,
  ShieldCheck,
  ArrowUpRight,
  Pencil,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useApp } from '../../state/AppContext';
import { modelApi } from '../../api/models';
import { routingApi } from '../../api/routing';
import { systemApi } from '../../api/system';
import {
  MODEL_GROUPS,
  type Model,
  type RoutingRule,
  type ComputeNode,
} from '../../types';
import {
  Button,
  PageHeader,
  SectionHeading,
  StatusBadge,
  SearchField,
  Picker,
  Modal,
  ErrorMessage,
  number,
} from '../../components/common';
function ModelRow({ model }: { model: Model }) {
  const { data, act } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(model);
  const [busy, setBusy] = useState(false);
  const node = data?.nodes.find((n) => n.id === model.nodeId);
  return (
    <div className={`model-row ${open ? 'expanded' : ''}`}>
      <div className="model-row-main">
        <button
          className="model-expand"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            setDraft(model);
          }}
        >
          <Cpu size={18} />
          <span>
            <b>{model.name}</b>
            <small>{model.role}</small>
          </span>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="mono model-priority">P{model.priority}</span>
        <span className="model-node mono">{node?.name ?? 'Unassigned'}</span>
        <StatusBadge status={model.enabled ? 'online' : 'disabled'} />
        <Switch
          aria-label={`Enable ${model.name}`}
          checked={model.enabled}
          onCheckedChange={(enabled) =>
            void act(
              () => modelApi.update(model.id, { enabled }),
              `${model.name} ${enabled ? 'enabled' : 'disabled'}`,
            )
          }
        />
      </div>
      {open && (
        <form
          className="model-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await act(
              () =>
                modelApi.update(model.id, {
                  priority: draft.priority,
                  nodeId: draft.nodeId,
                  role: draft.role,
                  context: draft.context,
                }),
              'Model configuration saved',
            );
            setBusy(false);
          }}
        >
          <div className="field-grid">
            <label>
              Assigned compute node
              <Picker
                label={`Node for ${model.name}`}
                value={draft.nodeId}
                onChange={(nodeId) => setDraft({ ...draft, nodeId })}
                options={
                  data?.nodes.map((n) => ({
                    value: n.id,
                    label: `${n.name} · ${n.status}`,
                  })) ?? []
                }
              />
            </label>
            <label>
              Routing priority
              <input
                type="number"
                min={1}
                max={10}
                value={draft.priority}
                onChange={(e) =>
                  setDraft({ ...draft, priority: Number(e.target.value) })
                }
                required
              />
            </label>
            <label>
              Model role
              <input
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                required
              />
            </label>
            <label>
              Context window (tokens)
              <input
                type="number"
                min={1024}
                max={1000000}
                value={draft.context}
                onChange={(e) =>
                  setDraft({ ...draft, context: Number(e.target.value) })
                }
                required
              />
            </label>
          </div>
          <div className="model-edit-footer">
            <span>
              Registry assignment is a preference. The router can select another
              available local node.
            </span>
            <Button primary type="submit" loading={busy}>
              <Save size={14} />
              Save model
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
export function ModelsPage() {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  return (
    <>
      <PageHeader
        eyebrow="AI INFRASTRUCTURE / MODEL REGISTRY"
        title="Local models"
        description="Four specialized model groups. One sovereign intelligence layer."
      />
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search models…"
        />
        <Picker
          label="Filter model group"
          value={group}
          onChange={setGroup}
          options={['all', ...MODEL_GROUPS]}
        />
      </div>
      <div className="model-groups">
        {MODEL_GROUPS.filter((g) => group === 'all' || g === group).map(
          (g, i) => {
            const models =
              data?.models.filter(
                (m) =>
                  m.group === g &&
                  m.name.toLowerCase().includes(query.toLowerCase()),
              ) ?? [];
            return (
              <section className="model-group" key={g}>
                <div className="model-group-heading">
                  <span className="model-group-number">0{i + 1}</span>
                  <div>
                    <h2>{g}</h2>
                    <p>
                      {
                        [
                          'Reasoning, planning & complex tasks',
                          'Document vision & optical character recognition',
                          'Rapid text processing & summaries',
                          'Embeddings & local knowledge retrieval',
                        ][i]
                      }
                    </p>
                  </div>
                  <span className="mono">
                    {models.filter((m) => m.enabled).length} / {models.length}{' '}
                    ENABLED
                  </span>
                </div>
                {models.length ? (
                  models
                    .sort((a, b) => a.priority - b.priority)
                    .map((m) => <ModelRow model={m} key={m.id} />)
                ) : (
                  <p className="note">No matching models in this group.</p>
                )}
              </section>
            );
          },
        )}
      </div>
    </>
  );
}
export function RoutingPage() {
  const { data, act } = useApp();
  const [editing, setEditing] = useState<RoutingRule | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await routingApi.update(editing!.id, editing!);
      await act(async () => true, 'Routing configuration saved');
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="AI INFRASTRUCTURE / ORCHESTRATION"
        title="Model routing"
        description="The right intelligence for every task. Entirely within your boundary."
      />
      <div className="routing-architecture">
        <span className="eyebrow">THE LOCAL EXECUTION PATH</span>
        <div>
          {[
            ['TASK REQUEST', FileIcon],
            ['MODEL ROUTER', GitBranch],
            ['MODEL REGISTRY', Boxes],
            ['COMPUTE REGISTRY', Server],
            ['AVAILABLE NODE', Cpu],
          ].map(([label, Icon], i) => {
            const I = Icon as typeof Cpu;
            return (
              <div className="architecture-item" key={String(label)}>
                <span className={i === 1 ? 'active' : ''}>
                  <I size={19} />
                  <b>{String(label)}</b>
                </span>
                {i < 4 && <i className="routing-signal" />}
              </div>
            );
          })}
        </div>
        <p>
          Models and hardware remain independent. Availability, priority, and
          fallback rules determine each assignment.
        </p>
      </div>
      <div className="routing-rows">
        <div className="routing-labels">
          <span>TASK / MODEL GROUP</span>
          <span>PRIMARY MODEL</span>
          <span>FALLBACK MODEL</span>
          <span>AVAILABLE NODE</span>
          <span />
        </div>
        {data.routing.map((r, i) => {
          const primary = data.models.find((m) => m.id === r.primaryId)!;
          const fallback = data.models.find((m) => m.id === r.fallbackId)!;
          const node = data.nodes.find((n) => n.id === primary.nodeId);
          return (
            <div className="routing-row" key={r.id}>
              <div className="routing-task">
                <span className="route-index">0{i + 1}</span>
                <div>
                  <b>{r.task}</b>
                  <small>{r.group}</small>
                </div>
              </div>
              <div
                className={`routing-model ${primary.enabled ? '' : 'unavailable'}`}
              >
                <span className="status-dot" />
                {primary.name}
                <small>
                  {primary.enabled
                    ? 'PRIMARY / ENABLED'
                    : 'DISABLED / USING FALLBACK'}
                </small>
              </div>
              <div className="routing-model fallback">
                {fallback.name}
                <small>
                  FALLBACK / {fallback.enabled ? 'READY' : 'DISABLED'}
                </small>
              </div>
              <div className="routing-node">
                <Server size={15} />
                {node?.name}
                <small>
                  {r.strategy === 'least_loaded' ? 'LEAST LOADED' : 'PRIORITY'}{' '}
                  · DYNAMIC
                </small>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setEditing({ ...r });
                  setError('');
                }}
                aria-label={`Edit ${r.task} routing`}
              >
                <Pencil size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="routing-policy-note">
        <ShieldCheck size={20} />
        <div>
          <h3>Local fallback, by design.</h3>
          <p>
            If the primary model is unavailable, the router tries its configured
            fallback. If an assigned node is unavailable, an available
            registered node is selected.
          </p>
        </div>
      </div>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Configure ${editing?.group ?? ''} routing`}
        description="Choose primary and fallback models within this group."
      >
        {editing && (
          <form className="form-stack" onSubmit={save}>
            <label>
              Primary model
              <Picker
                value={editing.primaryId}
                onChange={(primaryId) => setEditing({ ...editing, primaryId })}
                label="Primary model"
                options={data.models
                  .filter((m) => m.group === editing.group)
                  .map((m) => ({ value: m.id, label: m.name }))}
              />
            </label>
            <label>
              Fallback model
              <Picker
                value={editing.fallbackId}
                onChange={(fallbackId) =>
                  setEditing({ ...editing, fallbackId })
                }
                label="Fallback model"
                options={data.models
                  .filter((m) => m.group === editing.group)
                  .map((m) => ({ value: m.id, label: m.name }))}
              />
            </label>
            <label>
              Node selection
              <Picker
                value={editing.strategy}
                onChange={(strategy) =>
                  setEditing({
                    ...editing,
                    strategy: strategy as RoutingRule['strategy'],
                  })
                }
                label="Node selection strategy"
                options={[
                  {
                    value: 'least_loaded',
                    label: 'Least loaded available node',
                  },
                  { value: 'priority', label: 'Registry priority' },
                ]}
              />
            </label>
            {error && <ErrorMessage message={error} />}
            <div className="modal-actions">
              <Button type="button" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button primary loading={busy} type="submit">
                Save routing
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
function FileIcon(props: React.ComponentProps<typeof Cpu>) {
  return <Cpu {...props} />;
}
const emptyNode: Omit<ComputeNode, 'id' | 'activeTasks' | 'utilization'> = {
  name: '',
  host: '',
  type: 'COMPUTE NODE',
  accelerator: '',
  memory: 64,
  status: 'online',
  capacity: 4,
};
export function NodesPage() {
  const { data, act } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(emptyNode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="AI INFRASTRUCTURE / COMPUTE REGISTRY"
        title="Compute infrastructure"
        description="Your hardware. Your deployment. Register any local compute environment."
        action={
          <Button
            primary
            onClick={() => {
              setDraft(emptyNode);
              setOpen(true);
            }}
          >
            <Plus size={16} />
            Register compute node
          </Button>
        }
      />
      <div className="three-columns node-cards">
        {data?.nodes.map((n) => (
          <section className="node-card" key={n.id}>
            <div className="node-card-top">
              <span className="node-chip">
                <Server size={25} />
              </span>
              <StatusBadge status={n.status} />
            </div>
            <span className="eyebrow">{n.type}</span>
            <h2>{n.name}</h2>
            <span className="node-host mono">{n.host}</span>
            <div className="node-utilization">
              <div className="progress-caption">
                <span>COMPUTE UTILIZATION</span>
                <b>{n.utilization}%</b>
              </div>
              <Progress
                value={n.utilization}
                aria-label={`${n.name} utilization`}
              />
            </div>
            <dl className="node-specs">
              <div>
                <dt>MEMORY</dt>
                <dd>{n.memory} GB</dd>
              </div>
              <div>
                <dt>ACCELERATOR</dt>
                <dd>{n.accelerator || 'General compute'}</dd>
              </div>
              <div>
                <dt>ACTIVE TASKS</dt>
                <dd>
                  {n.activeTasks} / {n.capacity}
                </dd>
              </div>
              <div>
                <dt>CAPACITY</dt>
                <dd>{n.capacity} concurrent</dd>
              </div>
            </dl>
            <div className="node-models">
              <span className="eyebrow">ASSIGNED MODELS</span>
              {data.models
                .filter((m) => m.nodeId === n.id)
                .map((m) => (
                  <span key={m.id}>{m.name}</span>
                ))}
              {!data.models.some((m) => m.nodeId === n.id) && (
                <p>No model preferences assigned.</p>
              )}
            </div>
            <div className="node-card-footer">
              <span>NODE STATUS</span>
              <Picker
                label={`${n.name} status`}
                value={n.status}
                onChange={(status) =>
                  void act(
                    () =>
                      systemApi.updateNode(n.id, {
                        status: status as ComputeNode['status'],
                      }),
                    'Node status updated',
                  )
                }
                options={['online', 'degraded', 'offline']}
              />
            </div>
          </section>
        ))}
      </div>
      <div className="note">
        <ShieldCheck size={15} />
        Model assignments are preferred placements. The mock router supports
        fallback to other available nodes without hardware assumptions.
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Register compute node"
        description="Add any local server, cluster, or compute host."
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await systemApi.registerNode(draft);
              await act(async () => true, 'Compute node registered');
              setOpen(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="field-grid">
            <label>
              Node name
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. INFERENCE NODE 04"
              />
            </label>
            <label>
              Host / address
              <input
                required
                value={draft.host}
                onChange={(e) => setDraft({ ...draft, host: e.target.value })}
                placeholder="10.0.0.14 or local hostname"
              />
            </label>
            <label>
              Node type
              <input
                required
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                placeholder="Any compute environment"
              />
            </label>
            <label>
              Accelerator
              <input
                value={draft.accelerator}
                onChange={(e) =>
                  setDraft({ ...draft, accelerator: e.target.value })
                }
                placeholder="Describe available compute"
              />
            </label>
            <label>
              Memory (GB)
              <input
                type="number"
                min={1}
                max={1000000}
                required
                value={draft.memory}
                onChange={(e) =>
                  setDraft({ ...draft, memory: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Concurrent task capacity
              <input
                type="number"
                min={1}
                max={1000}
                required
                value={draft.capacity}
                onChange={(e) =>
                  setDraft({ ...draft, capacity: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {error && <ErrorMessage message={error} />}
          <div className="modal-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" primary loading={busy}>
              Register node
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
