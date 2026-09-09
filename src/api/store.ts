import { createSeed } from './seed';
import type { Database, User, Permission } from '../types';
const KEY = 'omnitrix.demo.v1';
let state: Database = createSeed();
let initialized = false;
const listeners = new Set<() => void>();
export function initializeStore() {
  if (initialized) return;
  initialized = true;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.users && parsed.models && parsed.settings) state = parsed;
    }
  } catch {
    /* Private sessions can still use in-memory mode. */
  }
}
export function getStore() {
  return state;
}
export function subscribeStore(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function updateStore(update: (draft: Database) => void) {
  const next = structuredClone(state);
  update(next);
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* In-memory fallback when storage is full or disabled. */
  }
  listeners.forEach((fn) => fn());
}
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function actor(): User {
  let id: string | null = null;
  try {
    id = sessionStorage.getItem('omnitrix.user');
  } catch {}
  const user = state.users.find((u) => u.id === id && u.enabled);
  if (!user)
    throw new ApiError(
      'UNAUTHENTICATED',
      'Your session has ended. Please sign in again.',
    );
  return user;
}
export function authorize(permission: Permission) {
  const user = actor();
  if (
    !user.permissions.includes(permission) ||
    (permission === 'admin' && user.role !== 'admin')
  )
    throw new ApiError(
      'FORBIDDEN',
      'You do not have permission to perform this action.',
    );
  return user;
}
export function own(ownerId: string, permission: Permission) {
  const user = authorize(permission);
  if (user.role !== 'admin' && user.id !== ownerId)
    throw new ApiError(
      'FORBIDDEN',
      'This resource belongs to another operator.',
    );
  return user;
}
export const uid = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export function log(
  draft: Database,
  action: string,
  resource: string,
  status: 'success' | 'failed' | 'info' = 'success',
  taskId?: string,
  by?: User,
) {
  const user = by ?? actor();
  draft.audit.unshift({
    id: uid('aud'),
    timestamp: new Date().toISOString(),
    actorId: user.id,
    actor: user.name,
    action,
    resource,
    status,
    taskId,
  });
  draft.audit = draft.audit.slice(0, 1000);
}
export const delay = (ms = 220) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
