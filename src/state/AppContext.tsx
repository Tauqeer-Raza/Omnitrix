import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Database, User } from '../types';
import { authApi } from '../api/auth';
import { systemApi } from '../api/system';
import { initializeStore, subscribeStore, ApiError } from '../api/store';
import { API_MODE } from '../api/transport';
import { startEventEngine, taskEvents } from '../api/events';
import { toast } from 'sonner';
interface AppState {
  user: User | null;
  data: Database | null;
  loading: boolean;
  error: string;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  act: <T>(
    operation: () => Promise<T>,
    message?: string,
  ) => Promise<T | undefined>;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const userId = user?.id;
  const activeTaskIds =
    data?.tasks
      .filter((t) => ['queued', 'running'].includes(t.status))
      .map((t) => t.id)
      .sort()
      .join(',') ?? '';
  const subscribeLiveTasks = useEffectEvent(() => {
    const stops =
      data?.tasks
        .filter((t) => ['queued', 'running'].includes(t.status))
        .map((task) =>
          taskEvents.subscribe(
            task.id,
            (event) => {
              setData((previous) =>
                previous
                  ? {
                      ...previous,
                      tasks: previous.tasks.map((t) => {
                        if (
                          t.id !== event.taskId ||
                          t.events.some((e) => e.id === event.id)
                        )
                          return t;
                        const terminal =
                          event.type === 'task_completed' ||
                          event.type === 'task_failed';
                        return {
                          ...t,
                          events: [...t.events, event],
                          ...(event.delta
                            ? { reply: (t.reply ?? '') + event.delta }
                            : {}),
                          status: terminal
                            ? event.type === 'task_completed'
                              ? ('completed' as const)
                              : ('failed' as const)
                            : ('running' as const),
                        };
                      }),
                    }
                  : previous,
              );
              if (
                event.type === 'task_completed' ||
                event.type === 'task_failed'
              )
                void refresh();
            },
            undefined,
            task.events.at(-1)?.id,
          ),
        ) ?? [];
    return () => stops.forEach((stop) => stop());
  });
  useEffect(() => {
    if (API_MODE === 'http' && userId && activeTaskIds)
      return subscribeLiveTasks();
  }, [activeTaskIds, userId]);
  const refresh = useCallback(async () => {
    try {
      const next = await systemApi.getStatus();
      setData(next);
      setUser((u) => next.users.find((x) => x.id === u?.id) ?? u);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.code === 'UNAUTHENTICATED') {
        setUser(null);
        setData(null);
      }
    }
  }, []);
  useEffect(() => {
    initializeStore();
    let alive = true;
    authApi
      .me()
      .then(async (u) => {
        if (alive) {
          setUser(u);
          await refresh();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!userId) return;
    const stop = startEventEngine();
    const unsub =
      API_MODE === 'mock'
        ? subscribeStore(() => {
            void refresh();
          })
        : () => {};
    const timer =
      API_MODE === 'http' ? setInterval(() => void refresh(), 4000) : undefined;
    return () => {
      stop();
      unsub();
      if (timer) clearInterval(timer);
    };
  }, [userId, refresh]);
  const login = async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    setUser(session.user);
    await refresh();
    return session.user;
  };
  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setData(null);
  };
  const act = async <T,>(operation: () => Promise<T>, message?: string) => {
    try {
      const value = await operation();
      await refresh();
      if (message) toast.success(message);
      return value;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    }
  };
  return (
    <Context.Provider
      value={{ user, data, loading, error, login, logout, refresh, act }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider is required.');
  return value;
}
