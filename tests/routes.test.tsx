import { beforeEach, describe, it, expect } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { createSeed } from '../src/api/seed';
import { initializeStore, updateStore, getStore } from '../src/api/store';
import { advanceMockTasks } from '../src/api/events';
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  initializeStore();
  updateStore((d) => {
    Object.assign(d, createSeed());
    d.tasks = d.tasks.map((t) =>
      ['queued', 'running'].includes(t.status)
        ? { ...t, status: 'completed', step: 7 }
        : t,
    );
  });
});
function open(path: string, user?: string) {
  if (user) sessionStorage.setItem('omnitrix.user', user);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe('rendered routes and primary controls', () => {
  it('redirects protected URLs to sign-in, verifies credentials and opens workspace', async () => {
    open('/workspace');
    await screen.findByRole('heading', { name: /Welcome to the workbench/i });
    await userEvent.type(screen.getByLabelText('Password'), 'Omnitrix@2026');
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in securely' }),
    );
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    expect(
      screen.getByRole('textbox', { name: 'Message Omnitrix' }),
    ).toBeTruthy();
  });
  it('blocks an operator from administrative pages', async () => {
    open('/admin/models', 'usr-01');
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    expect(screen.queryByRole('heading', { name: 'Local models' })).toBeNull();
  });
  it('keeps navigation collapsed when the operator toggles it', async () => {
    open('/workspace', 'usr-01');
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Toggle Sidebar' }),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-state="collapsed"]')).toBeTruthy(),
    );
  });
  it.each([
    ['/workspace/new', 'What can I help you with?', 'usr-01'],
    ['/workspace/chats/tsk-1048', 'Inspection Report Analysis', 'usr-01'],
    ['/workspace/documents', 'Document library', 'usr-01'],
    ['/workspace/documents/doc-01', 'Inspection Report Analysis', 'usr-01'],
    ['/workspace/code', 'Code tasks', 'usr-01'],
    ['/workspace/code/tsk-1047', 'Pipeline Calculation', 'usr-01'],
    ['/workspace/knowledge', 'Knowledge base', 'usr-01'],
    ['/workspace/runs', 'Agent runs', 'usr-01'],
    ['/workspace/runs/tsk-1048', 'Inspection Report Analysis', 'usr-01'],
    ['/workspace/audit', 'What can I help you with?', 'usr-01'],
    ['/workspace/system', 'System status', 'usr-01'],
    ['/admin', 'Control center', 'usr-admin'],
    ['/admin/resources', 'Resource usage', 'usr-admin'],
    ['/admin/models', 'Local models', 'usr-admin'],
    ['/admin/routing', 'Model routing', 'usr-admin'],
    ['/admin/nodes', 'Compute infrastructure', 'usr-admin'],
    ['/admin/users', 'Users', 'usr-admin'],
    ['/admin/users/usr-01', 'Operator 01', 'usr-admin'],
    ['/admin/permissions', 'Permissions', 'usr-admin'],
    ['/admin/tokens', 'Token & resource limits', 'usr-admin'],
    ['/admin/audit', 'Audit logs', 'usr-admin'],
    ['/admin/security', 'Security status', 'usr-admin'],
    ['/admin/settings', 'Settings', 'usr-admin'],
  ])('renders %s with its primary heading', async (path, title, user) => {
    open(path, user);
    expect(
      await screen.findByRole(
        'heading',
        { name: title, level: 1 },
        { timeout: 10000 },
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText('The workspace could not be displayed.'),
    ).toBeNull();
  });
  it('switches a completed document workflow to the output view', async () => {
    open('/workspace/runs/tsk-1048', 'usr-01');
    await screen.findByRole('heading', { name: 'Inspection Report Analysis' });
    await userEvent.click(
      screen.getByRole('tab', { name: /Output & deliverables/ }),
    );
    expect(
      await screen.findByRole('button', { name: 'Download Word' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy();
  });
  it('routes an attached report automatically and displays activity alongside the conversation', async () => {
    open('/workspace/new', 'usr-01');
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    await userEvent.type(
      screen.getByLabelText('Message Omnitrix'),
      'Prepare a synthetic inspection summary with source references.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Attach files' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Try with a sample report' }),
    );
    await screen.findByText('Inspection Report.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByRole('heading', {
      name: 'Prepare a synthetic inspection summary with source references',
    });
    expect(getStore().tasks[0].type).toBe('document');
    expect(
      screen.getByRole('complementary', { name: 'Task activity' }),
    ).toBeTruthy();
    expect(screen.getByText('SOVEREIGNTY CONSOLE')).toBeTruthy();
  });
  it('offers a quiet landing page with chat history, resource allocation and navbar capabilities', async () => {
    open('/workspace', 'usr-01');
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    const nav = within(
      screen.getByRole('navigation', { name: 'Workspace navigation' }),
    );
    expect(nav.getByRole('link', { name: 'Knowledge Base' })).toBeTruthy();
    expect(nav.getByRole('link', { name: 'Agent Runs' })).toBeTruthy();
    expect(
      screen.getByRole('navigation', { name: 'Previous chats' }),
    ).toBeTruthy();
    expect(screen.getByText('tokens remaining')).toBeTruthy();
    expect(screen.getByText('Used')).toBeTruthy();
    expect(screen.queryByText('SOVEREIGNTY CONSOLE')).toBeNull();
    expect(screen.queryByRole('link', { name: /Audit log/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Documents' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Code tasks' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: /Prepare a note/ }),
    );
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Message Omnitrix',
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('shift handover');
    expect(screen.getByRole('textbox', { name: 'Message Omnitrix' })).toBe(
      document.activeElement,
    );
  });
  it('keeps follow-ups together, updates tokens, and only reveals completed activity on request', async () => {
    open('/workspace', 'usr-01');
    const input = await screen.findByRole('textbox', {
      name: 'Message Omnitrix',
    });
    const used = getStore().users.find((u) => u.id === 'usr-01')!.used;
    fireEvent.change(input, {
      target: { value: 'Help me prepare a shift handover note' },
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('heading', {
      name: 'Help me prepare a shift handover note',
    });
    const root = getStore().tasks[0];
    expect(root.type).toBe('general');
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Message Omnitrix',
        }) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      for (let i = 0; i < 8; i++) advanceMockTasks();
    });
    await screen.findByText(/Here’s a simple structure/);
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Task activity' }),
      ).toBeNull(),
    );
    expect(getStore().users.find((u) => u.id === 'usr-01')!.used).toBe(
      used + 2400,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'View activity' }),
    );
    expect(
      screen.getByRole('complementary', { name: 'Task activity' }),
    ).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide activity' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Message Omnitrix' }),
      { target: { value: 'Make it shorter' } },
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect(getStore().tasks[0].prompt).toBe('Make it shorter'),
    );
    expect(getStore().tasks[0].conversationId).toBe(root.id);
    await act(async () => {
      for (let i = 0; i < 8; i++) advanceMockTasks();
    });
    await screen.findByText(/Here is a shorter version/);
    const history = within(
      screen.getByRole('navigation', { name: 'Previous chats' }),
    );
    expect(history.getAllByRole('link', { name: root.title })).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('link', { name: 'New chat' })[0]);
    await screen.findByRole('heading', { name: 'What can I help you with?' });
    expect(screen.queryByText('Make it shorter')).toBeNull();
    await userEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Previous chats' }),
      ).getByRole('link', { name: root.title }),
    );
    await screen.findByText('Make it shorter');
    expect(screen.getByText(/Here is a shorter version/)).toBeTruthy();
    expect(
      screen.queryByRole('complementary', { name: 'Task activity' }),
    ).toBeNull();
  });
  it('updates model state through the model registry toggle', async () => {
    open('/admin/models', 'usr-admin');
    await screen.findByRole('heading', { name: 'Local models' });
    const toggle = screen.getByRole('switch', {
      name: 'Enable LLAMA 3-70B Instruct',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle.getAttribute('aria-checked')).toBe('false'),
    );
  });
});
