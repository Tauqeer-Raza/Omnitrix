import type { Session, Role, Permission, User } from '../types';
import { endpoint } from './transport';
import { ApiError, actor, getStore, log, updateStore } from './store';
export const hasRole = (user: User | null, role: Role) => user?.role === role;
export const hasPermission = (user: User | null, permission: Permission) =>
  !!user?.enabled && !!user.permissions.includes(permission);
export const authApi = {
  login: (email: string, password: string) =>
    endpoint<Session>(
      'POST',
      '/auth/login',
      { email, password },
      () => {
        const user = getStore().users.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
        );
        if (!user || !user.enabled || password !== 'Omnitrix@2026')
          throw new ApiError(
            'INVALID_CREDENTIALS',
            'Email or password is incorrect, or this account is disabled.',
          );
        sessionStorage.setItem('omnitrix.user', user.id);
        updateStore((d) => {
          log(d, 'LOGIN', 'Local workbench', 'success', undefined, user);
        });
        return { user, token: `demo-session-${user.id}` };
      },
      true,
    ),
  me: () => endpoint<User>('GET', '/auth/me', undefined, actor, true),
  logout: () =>
    endpoint<void>(
      'POST',
      '/auth/logout',
      undefined,
      () => {
        try {
          updateStore((d) => log(d, 'LOGOUT', 'Local workbench'));
        } finally {
          sessionStorage.removeItem('omnitrix.user');
        }
      },
      true,
    ),
};
