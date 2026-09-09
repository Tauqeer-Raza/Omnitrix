import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Users,
  ShieldCheck,
  Save,
  KeyRound,
  FileText,
  Database,
  SquareCode,
  Gauge,
  Check,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useApp } from '../../state/AppContext';
import { userApi } from '../../api/users';
import { systemApi } from '../../api/system';
import { authApi } from '../../api/auth';
import {
  MODEL_GROUPS,
  type User,
  type Permission,
  type ModelGroup,
  type Settings as SettingsType,
} from '../../types';
import {
  Button,
  PageHeader,
  DataTable,
  StatusBadge,
  SearchField,
  Picker,
  Modal,
  ErrorMessage,
  ResourceMeter,
  SectionHeading,
  Empty,
  number,
  dateTime,
} from '../../components/common';
export function UsersPage() {
  const { data, act } = useApp();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE / IDENTITY"
        title="Users"
        description="Manage organizational access, model permissions and resource allocation."
        action={
          <Button primary onClick={() => setOpen(true)}>
            <Plus size={16} />
            Add user
          </Button>
        }
      />
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search users or departments…"
        />
        <Picker
          value={role}
          onChange={setRole}
          options={['all', 'admin', 'user']}
          label="Filter user role"
        />
      </div>
      <DataTable
        headers={[
          'NAME',
          'ROLE',
          'DEPARTMENT',
          'DAILY LIMIT',
          'MODEL ACCESS',
          'STATUS',
          'LAST ACTIVITY',
          '',
        ]}
        rows={(data?.users ?? [])
          .filter(
            (u) =>
              (u.name + ' ' + u.email + ' ' + u.department)
                .toLowerCase()
                .includes(query.toLowerCase()) &&
              (role === 'all' || u.role === role),
          )
          .map((u) => ({
            id: u.id,
            cells: [
              <Link className="user-cell" to={`/admin/users/${u.id}`}>
                <span className="avatar">
                  {u.name
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </span>
              </Link>,
              <span className="badge-outline">{u.role.toUpperCase()}</span>,
              u.department,
              <span className="mono">{number(u.dailyLimit)}</span>,
              <span className="mono">{u.modelAccess.length} / 4 GROUPS</span>,
              <StatusBadge status={u.enabled ? 'online' : 'disabled'} />,
              <span className="mono">{dateTime(u.lastActivity)}</span>,
              <Link to={`/admin/users/${u.id}`} aria-label={`Manage ${u.name}`}>
                <ArrowUpRight size={15} />
              </Link>,
            ],
          }))}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add organizational user"
        description="The new account uses the demo password Omnitrix@2026. Production provisioning belongs to FastAPI."
      >
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await userApi.create(name, email, department);
              await act(async () => true, 'User created');
              setOpen(false);
              setName('');
              setEmail('');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Full name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Organizational email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Department
            <input
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </label>
          {error && <ErrorMessage message={error} />}
          <div className="modal-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary type="submit" loading={busy}>
              Create user
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
const permissionLabels: Record<Permission, string> = {
  documents: 'Document access',
  knowledge: 'Knowledge access',
  code: 'Code execution',
  tasks: 'Agent workflows',
  audit: 'Audit visibility',
  admin: 'Infrastructure administration',
};
function UserEditor({ user }: { user: User }) {
  const { act } = useApp();
  const [draft, setDraft] = useState(user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await userApi.update(user.id, draft);
      await act(async () => true, 'User access and allocation saved');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <div className="two-columns">
        <section className="panel form-stack">
          <SectionHeading label="ACCOUNT & RESOURCE LIMITS" />
          <div className="user-detail-identity">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((x) => x[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
            <StatusBadge status={user.enabled ? 'online' : 'disabled'} />
          </div>
          <div className="field-grid">
            <label>
              Name
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Department
              <input
                required
                value={draft.department}
                onChange={(e) =>
                  setDraft({ ...draft, department: e.target.value })
                }
              />
            </label>
            <label>
              Role
              <Picker
                label="Account role"
                value={draft.role}
                onChange={(role) =>
                  setDraft({
                    ...draft,
                    role: role as User['role'],
                    permissions:
                      role === 'admin'
                        ? (Array.from(
                            new Set([...draft.permissions, 'admin']),
                          ) as Permission[])
                        : draft.permissions.filter((p) => p !== 'admin'),
                  })
                }
                options={['user', 'admin']}
              />
            </label>
            <label>
              Daily token limit
              <input
                type="number"
                min={1000}
                max={10000000}
                value={draft.dailyLimit}
                required
                onChange={(e) =>
                  setDraft({ ...draft, dailyLimit: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Monthly token limit
              <input
                type="number"
                min={1000}
                max={100000000}
                value={draft.monthlyLimit}
                required
                onChange={(e) =>
                  setDraft({ ...draft, monthlyLimit: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <ResourceMeter used={user.used} total={draft.dailyLimit} />
          <div className="toggle-row">
            <label htmlFor="account-enabled">
              Account enabled
              <small>Disabled accounts cannot sign in or run tasks.</small>
            </label>
            <Switch
              id="account-enabled"
              checked={draft.enabled}
              onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </div>
        </section>
        <section className="panel">
          <SectionHeading label="PERMISSIONS" />
          {(Object.keys(permissionLabels) as Permission[])
            .filter((p) => p !== 'admin' || draft.role === 'admin')
            .map((p) => (
              <div className="toggle-row" key={p}>
                <label htmlFor={`perm-${p}`}>{permissionLabels[p]}</label>
                <Switch
                  id={`perm-${p}`}
                  checked={draft.permissions.includes(p)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      permissions: checked
                        ? [...draft.permissions, p]
                        : draft.permissions.filter((x) => x !== p),
                    })
                  }
                />
              </div>
            ))}
          <div className="model-access-heading">
            <SectionHeading label="MODEL GROUP ACCESS" />
          </div>
          {MODEL_GROUPS.map((g) => (
            <div className="toggle-row" key={g}>
              <label htmlFor={`model-access-${g}`} className="mono">
                {g}
              </label>
              <Switch
                id={`model-access-${g}`}
                checked={draft.modelAccess.includes(g)}
                onCheckedChange={(checked) =>
                  setDraft({
                    ...draft,
                    modelAccess: checked
                      ? [...draft.modelAccess, g]
                      : draft.modelAccess.filter((x) => x !== g),
                  })
                }
              />
            </div>
          ))}
        </section>
      </div>
      {error && <ErrorMessage message={error} />}
      <div className="save-row">
        <p className="note">
          <ShieldCheck size={15} />
          Permission checks run in both protected routes and mock service
          actions.
        </p>
        <Button primary type="submit" loading={busy}>
          <Save size={15} />
          Save user changes
        </Button>
      </div>
    </form>
  );
}
export function UserDetailPage() {
  const { id } = useParams();
  const { data } = useApp();
  const user = data?.users.find((u) => u.id === id);
  if (!user) return <Empty message="User not found." />;
  return (
    <>
      <Link to="/admin/users" className="breadcrumb-back">
        <ArrowLeft size={13} />
        All users
      </Link>
      <PageHeader
        eyebrow="GOVERNANCE / ACCOUNT DETAIL"
        title={user.name}
        description="Identity, permissions and local resource allocation."
      />
      <UserEditor key={user.id} user={user} />
    </>
  );
}
export function PermissionsPage() {
  const { data } = useApp();
  const [selected, setSelected] = useState('usr-01');
  const user = data?.users.find((u) => u.id === selected) ?? data?.users[0];
  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE / ACCESS CONTROL"
        title="Permissions"
        description="Grant the capabilities each operator needs, with explicit model and tool access."
      />
      <div className="permissions-summary">
        <KeyRound size={25} />
        <div>
          <h3>Account-based access</h3>
          <p>
            Roles are verified at sign-in. Changes below update the selected
            operator’s permissions and model access.
          </p>
        </div>
        <Picker
          label="Select user for permission editing"
          value={user?.id ?? ''}
          onChange={setSelected}
          options={
            data?.users.map((u) => ({ value: u.id, label: u.name })) ?? []
          }
        />
      </div>
      {user && <UserEditor key={user.id} user={user} />}
    </>
  );
}
export function TokensPage() {
  const { data, act } = useApp();
  const [limits, setLimits] = useState({
    daily: data?.settings.dailyLimit ?? 500000,
    monthly: data?.settings.monthlyLimit ?? 12000000,
  });
  const [userId, setUserId] = useState('usr-01');
  const selected = data?.users.find((u) => u.id === userId) ?? data?.users[0];
  const [daily, setDaily] = useState(selected?.dailyLimit ?? 50000);
  const [monthly, setMonthly] = useState(selected?.monthlyLimit ?? 1000000);
  const [departments, setDepartments] = useState(
    data?.settings.departmentLimits ?? {},
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data || !selected) return null;
  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE / RESOURCE POLICIES"
        title="Token & resource limits"
        description="Allocate local intelligence with clear organizational and operator boundaries."
        action={
          <Button primary onClick={() => setConfirm(true)}>
            <Save size={15} />
            Review changes
          </Button>
        }
      />
      <div className="two-columns token-panels">
        <section className="panel form-stack">
          <SectionHeading label="ORGANIZATION LIMITS" />
          <label>
            Global daily token limit
            <input
              type="number"
              min={1000}
              max={100000000}
              value={limits.daily}
              onChange={(e) =>
                setLimits({ ...limits, daily: Number(e.target.value) })
              }
            />
          </label>
          <Slider
            aria-label="Global daily token limit"
            min={50000}
            max={2000000}
            step={10000}
            value={[limits.daily]}
            onValueChange={(v) =>
              setLimits({ ...limits, daily: Array.isArray(v) ? v[0] : v })
            }
          />
          <label>
            Global monthly token limit
            <input
              type="number"
              min={1000}
              max={1000000000}
              value={limits.monthly}
              onChange={(e) =>
                setLimits({ ...limits, monthly: Number(e.target.value) })
              }
            />
          </label>
          <ResourceMeter
            used={data.users.reduce((s, u) => s + u.used, 0)}
            total={limits.daily}
            label="DAILY ORGANIZATION USAGE"
          />
        </section>
        <section className="panel form-stack">
          <SectionHeading label="OPERATOR ALLOCATION" />
          <Picker
            label="Select operator allocation"
            value={selected.id}
            onChange={(id) => {
              setUserId(id);
              const u = data.users.find((u) => u.id === id)!;
              setDaily(u.dailyLimit);
              setMonthly(u.monthlyLimit);
            }}
            options={data.users.map((u) => ({
              value: u.id,
              label: `${u.name} · ${u.department}`,
            }))}
          />
          <label>
            User daily limit
            <input
              type="number"
              min={1000}
              max={10000000}
              value={daily}
              onChange={(e) => setDaily(Number(e.target.value))}
            />
          </label>
          <Slider
            aria-label="User daily allocation"
            min={1000}
            max={200000}
            step={1000}
            value={[daily]}
            onValueChange={(v) => setDaily(Array.isArray(v) ? v[0] : v)}
          />
          <label>
            User monthly limit
            <input
              type="number"
              min={1000}
              max={100000000}
              value={monthly}
              onChange={(e) => setMonthly(Number(e.target.value))}
            />
          </label>
          <ResourceMeter
            used={selected.used}
            total={daily}
            label="OPERATOR DAILY USAGE"
          />
        </section>
      </div>
      <section className="panel department-limits">
        <SectionHeading label="DEPARTMENT LIMITS" />
        <div className="field-grid">
          {Object.entries(departments).map(([name, limit]) => (
            <label key={name}>
              {name} / tokens per day
              <input
                type="number"
                min={1000}
                max={10000000}
                value={limit}
                onChange={(e) =>
                  setDepartments({
                    ...departments,
                    [name]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>
      <div className="note">
        <ShieldCheck size={16} />
        Global, department, and individual limits are checked before every task.
        Running workflows reserve their allocation.
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Apply resource limits?"
        description="These limits will immediately affect new tasks and the operator’s remaining allocation."
      >
        <dl className="confirmation-summary">
          <div>
            <dt>Global daily / monthly</dt>
            <dd>
              {number(limits.daily)} / {number(limits.monthly)}
            </dd>
          </div>
          <div>
            <dt>{selected.name} daily / monthly</dt>
            <dd>
              {number(daily)} / {number(monthly)}
            </dd>
          </div>
          {Object.entries(departments).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{number(value)} / day</dd>
            </div>
          ))}
        </dl>
        {error && <ErrorMessage message={error} />}
        <div className="modal-actions">
          <Button onClick={() => setConfirm(false)}>Keep editing</Button>
          <Button
            primary
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                if (
                  [
                    limits.daily,
                    limits.monthly,
                    daily,
                    monthly,
                    ...Object.values(departments),
                  ].some((v) => !Number.isFinite(v) || v < 1000)
                )
                  throw new Error('All limits must be at least 1,000 tokens.');
                await systemApi.updateSettings({
                  dailyLimit: limits.daily,
                  monthlyLimit: limits.monthly,
                  departmentLimits: departments,
                });
                await userApi.update(selected.id, {
                  dailyLimit: daily,
                  monthlyLimit: monthly,
                });
                await act(async () => true, 'Resource limits updated');
                setConfirm(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply limits
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function SettingsPage() {
  const { data, act } = useApp();
  const [draft, setDraft] = useState<SettingsType | null>(
    data?.settings ?? null,
  );
  const [busy, setBusy] = useState(false);
  if (!draft) return null;
  return (
    <>
      <PageHeader
        eyebrow="SYSTEM / CONFIGURATION"
        title="Settings"
        description="Organization preferences and local execution policies."
      />
      <form
        className="settings-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await act(() => systemApi.updateSettings(draft), 'Settings saved');
          setBusy(false);
        }}
      >
        <section className="panel form-stack">
          <SectionHeading label="ORGANIZATION" />
          <label>
            Organization name
            <input
              value={draft.organization}
              required
              onChange={(e) =>
                setDraft({ ...draft, organization: e.target.value })
              }
            />
          </label>
          <div className="field-grid">
            <label>
              Audit retention (days)
              <input
                type="number"
                min={1}
                max={3650}
                required
                value={draft.retentionDays}
                onChange={(e) =>
                  setDraft({ ...draft, retentionDays: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Task timeout (seconds)
              <input
                type="number"
                min={30}
                max={3600}
                required
                value={draft.timeout}
                onChange={(e) =>
                  setDraft({ ...draft, timeout: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="toggle-row">
            <label htmlFor="review-policy">
              Require human review
              <small>
                Mark generated documents as drafts requiring review.
              </small>
            </label>
            <Switch
              id="review-policy"
              checked={draft.requireReview}
              onCheckedChange={(requireReview) =>
                setDraft({ ...draft, requireReview })
              }
            />
          </div>
          <p className="note">
            Retention and execution timeout are stored as backend policy
            configuration. The browser demo does not enforce retention deletion.
          </p>
        </section>
        <section className="panel form-stack">
          <SectionHeading label="DEMO SERVICE CONTROLS" />
          <div className="toggle-row">
            <label htmlFor="offline-mode">
              Simulate backend unavailable
              <small>
                Pause event processing and make service requests fail. Settings
                remains available to reconnect.
              </small>
            </label>
            <Switch
              id="offline-mode"
              checked={draft.offline}
              onCheckedChange={(offline) => setDraft({ ...draft, offline })}
            />
          </div>
          <div className="settings-architecture">
            <span className="eyebrow">INTEGRATION BOUNDARY</span>
            <p>React UI → typed API services → mock adapter / FastAPI</p>
            <code>VITE_API_MODE=mock</code>
            <p>
              The mock adapter uses this browser’s local storage. Production
              authentication, access control, inference, file processing,
              network isolation and sandboxing must be provided by the backend.
            </p>
          </div>
        </section>
        <div className="save-row">
          <span className="note">
            <ShieldCheck size={15} />
            All settings changes are audit logged.
          </span>
          <Button primary loading={busy} type="submit">
            <Save size={15} />
            Save settings
          </Button>
        </div>
      </form>
    </>
  );
}
