import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { createSeed } from '../src/api/seed';
import { initializeStore, updateStore } from '../src/api/store';
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
    await screen.findByRole('heading', { name: 'Good morning, operator.' });
    expect(screen.getByRole('textbox', { name: 'Task request' })).toBeTruthy();
  });
  it('blocks an operator from administrative pages', async () => {
    open('/admin/models', 'usr-01');
    await screen.findByRole('heading', { name: 'Good morning, operator.' });
    expect(screen.queryByRole('heading', { name: 'Local models' })).toBeNull();
  });
  it('keeps navigation collapsed when the operator toggles it', async () => {
    open('/workspace', 'usr-01');
    await screen.findByRole('heading', { name: 'Good morning, operator.' });
    await userEvent.click(
      screen.getByRole('button', { name: 'Toggle Sidebar' }),
    );
    await waitFor(() =>
      expect(document.querySelector('[data-state="collapsed"]')).toBeTruthy(),
    );
  });
  it.each([
    ['/workspace/new', 'New task', 'usr-01'],
    ['/workspace/documents', 'Document library', 'usr-01'],
    ['/workspace/documents/doc-01', 'Inspection Report Analysis', 'usr-01'],
    ['/workspace/code', 'Code tasks', 'usr-01'],
    ['/workspace/code/tsk-1047', 'Pipeline Calculation', 'usr-01'],
    ['/workspace/knowledge', 'Knowledge base', 'usr-01'],
    ['/workspace/runs', 'Agent runs', 'usr-01'],
    ['/workspace/runs/tsk-1048', 'Inspection Report Analysis', 'usr-01'],
    ['/workspace/audit', 'Audit log', 'usr-01'],
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
  it('creates a document task from the visible form using the sample report', async () => {
    open('/workspace/new', 'usr-01');
    await screen.findByRole('heading', { name: 'New task' });
    await userEvent.type(
      screen.getByLabelText('What would you like Omnitrix to accomplish?'),
      'Prepare a synthetic inspection summary with source references.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Use sample report' }),
    );
    await screen.findByText('Inspection Report.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Start task' }));
    await screen.findByRole('heading', {
      name: 'Prepare a synthetic inspection summary with source references',
    });
    expect(screen.getByText('AGENT ACTIVITY')).toBeTruthy();
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
