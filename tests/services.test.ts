import { beforeEach, describe, it, expect, vi } from 'vitest';
import { authApi, hasPermission, hasRole } from '../src/api/auth';
import { createSeed } from '../src/api/seed';
import { getStore, initializeStore, updateStore } from '../src/api/store';
import { taskApi, resolveModel } from '../src/api/tasks';
import { advanceMockTasks } from '../src/api/events';
import { modelApi } from '../src/api/models';
import { routingApi } from '../src/api/routing';
import { userApi } from '../src/api/users';
import { systemApi } from '../src/api/system';
import { documentApi } from '../src/api/documents';
import {
  exportReport,
  exportSupplement,
  reportLines,
} from '../src/api/exports';
import { unzipSync, strFromU8 } from 'fflate';
import { getConversations } from '../src/lib/conversations';
const operator = () =>
  authApi.login('operator@omnitrix.local', 'Omnitrix@2026');
const admin = () => authApi.login('admin@omnitrix.local', 'Omnitrix@2026');
const input = {
  title: 'Integration inspection review',
  prompt: 'Review the synthetic inspection report and prepare a draft note.',
  type: 'document' as const,
  documentIds: ['doc-01'],
  scenario: 'normal' as const,
};
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  initializeStore();
  updateStore((d) => Object.assign(d, createSeed()));
});

describe('automatic orchestration and conversation history', () => {
  it('classifies everyday, calculation and attachment requests without a type selector', async () => {
    await operator();
    const base = { documentIds: [], scenario: 'normal' as const };
    const general = await taskApi.createTask({
      ...base,
      prompt: 'Help me draft a shift handover note',
    });
    const code = await taskApi.createTask({
      ...base,
      prompt: 'Calculate pipeline pressure drop',
    });
    const document = await taskApi.createTask({
      ...base,
      prompt: 'Summarize the findings',
      documentIds: ['doc-01'],
    });
    expect([general.type, code.type, document.type]).toEqual([
      'general',
      'code',
      'document',
    ]);
    expect(general.conversationId).toBe(general.id);
    expect(getStore().models.find((m) => m.id === general.modelId)?.group).toBe(
      'FAST',
    );
    for (let i = 0; i < 8; i++) advanceMockTasks();
    const result = await taskApi.getTask(general.id);
    expect(result.status).toBe('completed');
    expect(result.reply).toContain('simple structure');
    expect(result.tokens).toBe(2400);
  });
  it('inherits attachments and groups follow-ups without duplicating the previous chat', async () => {
    await operator();
    const root = await taskApi.createTask({ ...input, type: undefined });
    for (let i = 0; i < 8; i++) advanceMockTasks();
    const next = await taskApi.createTask({
      prompt: 'Make it shorter',
      documentIds: [],
      scenario: 'normal',
      conversationId: root.id,
    });
    expect(next.documentIds).toEqual(['doc-01']);
    expect(next.type).toBe('document');
    const chat = getConversations(getStore().tasks).find(
      (c) => c.id === root.id,
    )!;
    expect(chat.title).toBe(root.title);
    expect(chat.tasks.map((t) => t.id)).toEqual([root.id, next.id]);
    expect(chat.running).toBe(true);
  });
  it('rejects overlapping requests and access to another operator’s conversation', async () => {
    await operator();
    const root = await taskApi.createTask({ ...input, type: undefined });
    const followup = {
      prompt: 'Make it shorter',
      documentIds: [],
      scenario: 'normal' as const,
      conversationId: root.id,
    };
    await expect(taskApi.createTask(followup)).rejects.toThrow(
      'wait for the current',
    );
    updateStore((d) => {
      d.tasks.find((t) => t.id === root.id)!.ownerId = 'usr-02';
    });
    await expect(taskApi.createTask(followup)).rejects.toThrow(
      'another operator',
    );
    await expect(
      taskApi.createTask({ ...followup, conversationId: 'missing-chat' }),
    ).rejects.toThrow('no longer available');
  });
  it('retries only the latest failed message and never a completed response', async () => {
    await operator();
    const root = await taskApi.createTask({ ...input, type: undefined });
    await taskApi.cancel(root.id);
    const next = await taskApi.createTask({
      prompt: 'Continue the review',
      documentIds: [],
      scenario: 'normal',
      conversationId: root.id,
    });
    await expect(taskApi.retry(root.id)).rejects.toThrow('latest message');
    for (let i = 0; i < 8; i++) advanceMockTasks();
    await expect(taskApi.retry(next.id)).rejects.toThrow(
      'Only stopped or failed',
    );
  });
});
describe('authentication and service authorization', () => {
  it('derives role from credentials and rejects incorrect passwords', async () => {
    await expect(
      authApi.login('admin@omnitrix.local', 'bad-password'),
    ).rejects.toThrow('incorrect');
    const s = await operator();
    expect(s.user.role).toBe('user');
    expect(hasRole(s.user, 'user')).toBe(true);
    expect(hasPermission(s.user, 'admin')).toBe(false);
  });
  it('rejects an unauthenticated read and user admin mutations', async () => {
    await expect(systemApi.getStatus()).rejects.toThrow('sign in');
    await operator();
    await expect(
      modelApi.update('master-1', { enabled: false }),
    ).rejects.toThrow('permission');
    await expect(
      systemApi.registerNode({
        name: 'Unapproved',
        host: '10.0.0.99',
        type: 'CPU NODE',
        accelerator: 'General',
        memory: 64,
        capacity: 2,
        status: 'online',
      }),
    ).rejects.toThrow('permission');
    expect(getStore().models[0].enabled).toBe(true);
  });
  it('does not grant admin authority from a permission alone', async () => {
    await operator();
    updateStore((d) => {
      d.users[0].permissions.push('admin');
    });
    await expect(
      modelApi.update('master-1', { enabled: false }),
    ).rejects.toThrow('permission');
  });
  it('filters organization-wide state for an operator', async () => {
    await operator();
    const snapshot = await systemApi.getStatus();
    expect(snapshot.users).toHaveLength(1);
    expect(snapshot.audit.every((a) => a.actorId === 'usr-01')).toBe(true);
  });
  it('enforces ownership on task and document actions', async () => {
    await operator();
    updateStore((d) => {
      d.tasks[0].ownerId = 'usr-02';
      d.documents[0].ownerId = 'usr-02';
    });
    await expect(taskApi.getTask('tsk-1048')).rejects.toThrow(
      'another operator',
    );
    await expect(documentApi.remove('doc-01')).rejects.toThrow(
      'another operator',
    );
  });
  it('prevents self-removal of administrative access', async () => {
    await admin();
    await expect(
      userApi.update('usr-admin', { enabled: false }),
    ).rejects.toThrow('own administrative');
  });
  it('disabled users cannot sign in', async () => {
    await admin();
    await userApi.update('usr-01', { enabled: false });
    await expect(operator()).rejects.toThrow('disabled');
  });
});
describe('workflow execution and failure recovery', () => {
  it('runs the document journey to completion and charges once', async () => {
    await operator();
    updateStore((d) => {
      d.tasks = d.tasks.filter(
        (t) => !['running', 'queued'].includes(t.status),
      );
    });
    const before = getStore().users[0].used;
    const task = await taskApi.createTask(input);
    expect(task.status).toBe('queued');
    for (let i = 0; i < 8; i++) advanceMockTasks();
    const complete = await taskApi.getTask(task.id);
    expect(complete.status).toBe('completed');
    expect(complete.events.map((e) => e.type)).toEqual([
      'task_started',
      'task_classified',
      'model_routed',
      'ocr_completed',
      'rag_search',
      'agent_reasoning',
      'document_generated',
      'task_completed',
    ]);
    expect(getStore().users[0].used - before).toBe(2400);
    advanceMockTasks();
    expect(getStore().users[0].used - before).toBe(2400);
    expect(
      getStore().audit.some(
        (a) => a.taskId === task.id && a.action === 'TASK_COMPLETED',
      ),
    ).toBe(true);
  });
  it('fails retrieval intentionally then retries successfully', async () => {
    await operator();
    const task = await taskApi.createTask({
      ...input,
      scenario: 'rag_failure',
    });
    for (let i = 0; i < 5; i++) advanceMockTasks();
    expect((await taskApi.getTask(task.id)).status).toBe('failed');
    expect((await taskApi.getTask(task.id)).error).toMatch(/knowledge search/);
    await taskApi.retry(task.id);
    for (let i = 0; i < 8; i++) advanceMockTasks();
    expect((await taskApi.getTask(task.id)).status).toBe('completed');
  });
  it('supports coding failure and stops a cancelled workflow', async () => {
    await operator();
    const task = await taskApi.createTask({
      ...input,
      type: 'code',
      documentIds: [],
      scenario: 'sandbox_failure',
    });
    for (let i = 0; i < 6; i++) advanceMockTasks();
    expect((await taskApi.getTask(task.id)).error).toMatch(/Exit code 1/);
    await taskApi.retry(task.id);
    await taskApi.cancel(task.id);
    advanceMockTasks();
    expect((await taskApi.getTask(task.id)).error).toMatch(/cancelled/);
  });
  it('validates prompt and required document attachments', async () => {
    await operator();
    await expect(taskApi.createTask({ ...input, prompt: '' })).rejects.toThrow(
      '12 characters',
    );
    await expect(
      taskApi.createTask({ ...input, documentIds: [] }),
    ).rejects.toThrow('Attach at least');
  });
  it('uses configured fallback and another available generic node', async () => {
    await admin();
    await modelApi.update('vision-1', { enabled: false });
    const route = resolveModel(getStore(), 'VISION');
    expect(route.model.id).toBe('vision-2');
    expect(route.fallback).toBe(true);
    await systemApi.updateNode('node-02', { status: 'offline' });
    expect(resolveModel(getStore(), 'VISION').node.id).toBe('node-01');
  });
  it('rejects unavailable model groups and invalid routing', async () => {
    await admin();
    await modelApi.update('vision-1', { enabled: false });
    await modelApi.update('vision-2', { enabled: false });
    expect(() => resolveModel(getStore(), 'VISION')).toThrow(
      'No configured model',
    );
    await expect(
      routingApi.update('route-master', { fallbackId: 'master-1' }),
    ).rejects.toThrow('different');
    await expect(
      routingApi.update('route-master', { fallbackId: 'vision-1' }),
    ).rejects.toThrow('this model group');
  });
  it('blocks resource exhaustion after admin changes and checks model access', async () => {
    await admin();
    await userApi.update('usr-01', { dailyLimit: 33000 });
    await operator();
    await expect(taskApi.createTask(input)).rejects.toThrow('exhausted');
    await admin();
    await userApi.update('usr-01', {
      dailyLimit: 50000,
      modelAccess: ['FAST'],
    });
    await operator();
    await expect(taskApi.createTask(input)).rejects.toThrow('model access');
  });
  it('reserves tokens for concurrent tasks rather than oversubscribing', async () => {
    await operator();
    updateStore((d) => {
      d.tasks = [];
      d.users[0].dailyLimit = d.users[0].used + 3000;
    });
    await taskApi.createTask(input);
    await expect(taskApi.createTask(input)).rejects.toThrow('exhausted');
  });
  it('pauses on offline backend and recovers without losing task state', async () => {
    await admin();
    await systemApi.updateSettings({ offline: true });
    const before = getStore().tasks.find((t) => t.id === 'tsk-1046')!.step;
    advanceMockTasks();
    expect(getStore().tasks.find((t) => t.id === 'tsk-1046')!.step).toBe(
      before,
    );
    await expect(taskApi.getTask('tsk-1048')).rejects.toThrow('unavailable');
    await systemApi.reconnect();
    expect((await taskApi.getTask('tsk-1048')).status).toBe('completed');
  });
});
describe('uploads, exports and persistent admin state', () => {
  it('validates file type, size and empty uploads', async () => {
    await operator();
    await expect(
      documentApi.upload(new File(['bad'], 'danger.exe')),
    ).rejects.toThrow('Supported');
    await expect(documentApi.upload(new File([], 'empty.pdf'))).rejects.toThrow(
      'empty',
    );
    const large = new File(['x'], 'large.pdf');
    Object.defineProperty(large, 'size', { value: 21 * 1024 * 1024 });
    await expect(documentApi.upload(large)).rejects.toThrow('20 MB');
  });
  it('uploads a file and reports completed progress', async () => {
    await operator();
    const progress: number[] = [];
    const doc = await documentApi.upload(
      new File(['%PDF-1.4 sample'], 'test.pdf'),
      (p) => progress.push(p),
    );
    expect(progress.at(-1)).toBe(100);
    expect(getStore().documents.some((d) => d.id === doc.id)).toBe(true);
    expect(await documentApi.getFile(doc.id)).toBeDefined();
  });
  it('registers arbitrary hardware and updates audit records', async () => {
    await admin();
    const n = await systemApi.registerNode({
      name: 'Private research cluster',
      host: 'cluster.internal',
      type: 'CUSTOM LOCAL CLUSTER',
      accelerator: 'Organization compute fabric',
      memory: 768,
      capacity: 24,
      status: 'online',
    });
    await modelApi.update('master-1', { nodeId: n.id, priority: 3 });
    expect(getStore().models[0].nodeId).toBe(n.id);
    expect(getStore().audit.some((a) => a.action === 'NODE_REGISTERED')).toBe(
      true,
    );
    expect(
      JSON.parse(localStorage.getItem('omnitrix.demo.v1')!).nodes.some(
        (x: { id: string }) => x.id === n.id,
      ),
    ).toBe(true);
  });
  it('includes synthetic provenance and refuses unfinished output exports', async () => {
    await operator();
    const task = getStore().tasks[0];
    expect(reportLines(task, []).join(' ')).toContain(
      'Uploaded documents have not been analyzed',
    );
    await expect(exportReport(getStore().tasks[2], [], 'pdf')).rejects.toThrow(
      'Complete this task',
    );
  });
  it('exports a real PDF blob and records the download', async () => {
    await operator();
    const blobs: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return 'blob:demo';
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await exportReport(getStore().tasks[0], [], 'pdf');
    expect(blobs[0].type).toBe('application/pdf');
    expect(blobs[0].size).toBeGreaterThan(1000);
    expect(getStore().audit[0].action).toBe('DOCUMENT_DOWNLOADED');
    click.mockRestore();
  });
  it('creates valid Word, Excel and PowerPoint packages with synthetic provenance', async () => {
    await operator();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:export';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const task = getStore().tasks[0];
    await exportReport(task, [], 'docx');
    await exportSupplement(task, 'xlsx');
    await exportSupplement(task, 'pptx');
    expect(blobs).toHaveLength(3);
    async function bytes(blob: Blob) {
      if (typeof blob.arrayBuffer === 'function')
        return new Uint8Array(await blob.arrayBuffer());
      return new Uint8Array(
        await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        }),
      );
    }
    const [word, sheet, deck] = await Promise.all(
      blobs.map(async (b) => unzipSync(await bytes(b))),
    );
    expect(strFromU8(word['word/document.xml'])).toContain('SYNTHETIC DEMO');
    expect(strFromU8(sheet['xl/workbook.xml'])).toContain('Review register');
    expect(strFromU8(deck['ppt/presentation.xml'])).toContain('screen16x9');
    expect(strFromU8(deck['ppt/slides/slide1.xml'])).toContain(
      'does not analyze uploaded',
    );
    expect(
      Object.keys(deck).filter((p) => /^ppt\/slides\/slide\d.xml$/.test(p)),
    ).toHaveLength(3);
    click.mockRestore();
  });
});
