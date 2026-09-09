import type { User } from '../types';
import { endpoint } from './transport';
import {
  authorize,
  actor,
  getStore,
  updateStore,
  log,
  ApiError,
  uid,
} from './store';
export const userApi = {
  getUsers: () =>
    endpoint('GET', '/users', undefined, () => {
      authorize('admin');
      return getStore().users;
    }),
  update: (id: string, patch: Partial<User>) =>
    endpoint('PATCH', `/users/${id}`, patch, () => {
      const admin = authorize('admin');
      if (
        id === admin.id &&
        (patch.enabled === false ||
          patch.role === 'user' ||
          (patch.permissions && !patch.permissions.includes('admin')))
      )
        throw new ApiError(
          'VALIDATION',
          'You cannot remove your own administrative access.',
        );
      if (
        (patch.dailyLimit !== undefined && patch.dailyLimit < 1000) ||
        (patch.monthlyLimit !== undefined && patch.monthlyLimit < 1000)
      )
        throw new ApiError(
          'VALIDATION',
          'Limits must be at least 1,000 tokens.',
        );
      updateStore((d) => {
        const u = d.users.find((u) => u.id === id);
        if (!u) throw new ApiError('NOT_FOUND', 'User not found.');
        Object.assign(u, patch);
        log(
          d,
          patch.dailyLimit !== undefined
            ? 'TOKEN_LIMIT_CHANGED'
            : patch.enabled === false
              ? 'USER_DISABLED'
              : 'USER_UPDATED',
          u.name,
        );
      });
      return getStore().users.find((u) => u.id === id)!;
    }),
  create: (name: string, email: string, department: string) =>
    endpoint('POST', '/users', { name, email, department }, () => {
      authorize('admin');
      if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email))
        throw new ApiError('VALIDATION', 'Enter a name and valid email.');
      if (
        getStore().users.some(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        )
      )
        throw new ApiError('VALIDATION', 'An account already uses this email.');
      const user: User = {
        id: uid('usr'),
        name,
        email,
        department,
        role: 'user',
        permissions: ['documents', 'knowledge', 'tasks', 'audit'],
        modelAccess: ['MASTER', 'VISION', 'FAST', 'LIBRARIAN'],
        dailyLimit: 50000,
        monthlyLimit: 1000000,
        used: 0,
        monthlyUsed: 0,
        enabled: true,
        lastActivity: new Date().toISOString(),
      };
      updateStore((d) => {
        d.users.push(user);
        log(d, 'USER_CREATED', user.name);
      });
      return user;
    }),
  allocation: () => endpoint('GET', '/users/me/allocation', undefined, actor),
};
