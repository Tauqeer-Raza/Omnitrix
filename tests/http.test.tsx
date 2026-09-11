import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.hoisted(() => {
  vi.stubEnv('VITE_API_MODE', 'http');
});
import App from '../src/App';
import { createSeed } from '../src/api/seed';
import { systemApi } from '../src/api/system';
import { userApi } from '../src/api/users';
import type { AgentEvent, Database, User } from '../src/types';

let state: Database;
let identity: User | null;
class FakeEvents {
  static instances: FakeEvents[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public url: string,
    public options: unknown,
  ) {
    FakeEvents.instances.push(this);
  }
  emit(event: AgentEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const path = String(url).replace('/api/v1', '');
  if (path === '/auth/me')
    return Response.json(
      identity ?? { code: 'UNAUTHENTICATED', detail: 'Sign in' },
      { status: identity ? 200 : 401 },
    );
  if (path === '/system/snapshot') return Response.json(state);
  if (init?.method === 'PATCH') return Response.json({});
  if (path.endsWith('/file')) return new Response('actual uploaded document');
  throw new Error(`Unexpected HTTP request: ${path}`);
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  state = createSeed();
  state.tasks = [];
  state.documents = [];
  state.audit = [];
  state.users = state.users.map((u) => ({ ...u, used: 95, monthlyUsed: 95 }));
  state.telemetry = {
    mode: 'live',
    networkVerified: false,
    hardwareMetricsAvailable: false,
    usageHourly: Array.from({ length: 24 }, (_, i) => ({
      label: `${i}:00`,
      tokens: i === 23 ? 95 : 0,
    })),
    usageDaily: [{ label: 'Today', tokens: 95 }],
  };
  identity = state.users.find((u) => u.role === 'user')!;
  FakeEvents.instances = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEvents);
  document.cookie = 'omnitrix_csrf=csrf-test-value; path=/';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

it('uses session credentials, CSRF protection and writable admin fields', async () => {
  await systemApi.updateSettings({
    ...state.settings,
    id: 'organization',
  } as typeof state.settings);
  const [, request] = fetchMock.mock.calls.at(-1)!;
  expect(request?.credentials).toBe('include');
  expect(request?.headers).toMatchObject({
    'X-CSRF-Token': 'csrf-test-value',
    'X-Requested-With': 'Omnitrix',
  });
  expect(typeof request?.body).toBe('string');
  expect(JSON.parse(request?.body as string)).not.toHaveProperty('id');
  await userApi.update(identity!.id, identity!);
  const body = JSON.parse(fetchMock.mock.calls.at(-1)![1]?.body as string);
  expect(body).not.toHaveProperty('used');
  expect(body).not.toHaveProperty('id');
  expect(body).not.toHaveProperty('email');
});

it('hides demo credentials and sample actions in live mode', async () => {
  identity = null;
  open('/login');
  await screen.findByRole('heading', { name: /Welcome to the workbench/i });
  expect(screen.queryByText('Omnitrix@2026')).toBeNull();
  expect(screen.queryByText('operator@omnitrix.local')).toBeNull();
});

it('renders actual generated code without synthetic reports or test passes', async () => {
  const code = createSeed().tasks.find((t) => t.type === 'code')!;
  state.tasks = [
    {
      ...code,
      status: 'completed',
      reply: 'Actual service output: input validation required.',
      code: 'print("real service code")',
      executionStatus: 'not_executed',
      events: [],
      documentIds: [],
    },
  ];
  open(`/workspace/code/${code.id}`);
  await screen.findByText('Actual service output: input validation required.');
  expect(screen.getByText('print("real service code")')).toBeTruthy();
  expect(screen.getByText(/Code has not been executed/)).toBeTruthy();
  expect(screen.queryByText(/All tests passed/)).toBeNull();
  expect(screen.queryByText(/DRAFT APPROVAL NOTE/)).toBeNull();
});

it('streams response deltas once and resumes after the last persisted event', async () => {
  const original = createSeed().tasks.find((t) => t.ownerId === identity!.id)!;
  const event: AgentEvent = {
    id: 'evt-first',
    taskId: original.id,
    type: 'task_started',
    step: 'task_started',
    status: 'running',
    message: 'Accepted',
    timestamp: new Date().toISOString(),
  };
  state.tasks = [
    {
      ...original,
      type: 'general',
      status: 'running',
      step: 1,
      title: 'Live conversation',
      conversationId: original.id,
      reply: '',
      documentIds: [],
      events: [event],
      plan: {
        type: 'general',
        useKnowledge: false,
        routingReason: 'General conversation detected.',
        routeGroup: 'FAST',
        requestedCapabilities: ['orchestrator', 'text_generation'],
        steps: [
          {
            id: 'accept',
            label: 'Accept request',
            description: 'Request accepted.',
            capability: 'control_plane',
          },
          {
            id: 'generate',
            label: 'Generate draft',
            description: 'Generate locally.',
            capability: 'text_generation',
            modelGroup: 'FAST',
          },
        ],
      },
      route: {
        group: 'FAST',
        strategy: 'priority',
        selectedModelId: 'fast-1',
        selectedModel: 'text-actual',
        nodeId: 'node-01',
        node: 'Text specialist',
        fallback: false,
        reason: 'Configured primary selected.',
      },
    },
  ];
  const view = open(`/workspace/chats/${original.id}`);
  expect((await screen.findAllByText('Generate draft')).length).toBeGreaterThan(0);
  screen.getByRole('button', { name: 'Technical details' }).click();
  await screen.findByText('General conversation detected.');
  expect(screen.getByText('text-actual')).toBeTruthy();
  await waitFor(() => expect(FakeEvents.instances.length).toBeGreaterThan(0));
  const source = FakeEvents.instances.at(-1)!;
  expect(source.url).toContain('?after=evt-first');
  expect(source.options).toEqual({ withCredentials: true });
  const delta = {
    ...event,
    id: 'evt-delta',
    type: 'response_delta',
    delta: 'The worker is streaming this answer.',
  };
  act(() => {
    source.emit(delta);
    source.emit(delta);
  });
  await screen.findByText('The worker is streaming this answer.');
  expect(
    screen.queryByText(
      'The worker is streaming this answer.The worker is streaming this answer.',
    ),
  ).toBeNull();
  view.unmount();
  expect(source.close).toHaveBeenCalled();
});

it('shows SQL usage history and unavailable network telemetry on the admin dashboard', async () => {
  identity = state.users.find((u) => u.role === 'admin')!;
  open('/admin');
  await screen.findByRole('heading', { name: 'Control center' });
  expect(screen.getByText('RECORDED USAGE / UTC')).toBeTruthy();
  expect(screen.getByText('Network telemetry unavailable')).toBeTruthy();
  expect(
    screen.getByRole('img', { name: /Recorded token usage/ }),
  ).toBeTruthy();
  expect(screen.queryByText('Sovereignty maintained')).toBeNull();
});
