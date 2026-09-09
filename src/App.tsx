import {
  Suspense,
  lazy,
  type ReactNode,
  Component,
  type ErrorInfo,
} from 'react';
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppProvider, useApp } from './state/AppContext';
import { hasPermission } from './api/auth';
import type { Permission } from './types';
import Layout from './components/Layout';
import { Loading, Empty, Button } from './components/common';
import Login from './pages/Login';
const ChatWorkspace = lazy(() => import('./pages/ChatWorkspace'));
const DocumentWorkflow = lazy(() => import('./pages/DocumentWorkflow'));
const CodeWorkspace = lazy(() => import('./pages/CodeWorkspace'));
const DocumentsPage = lazy(() =>
  import('./pages/WorkLibrary').then((m) => ({ default: m.DocumentsPage })),
);
const CodeTasksPage = lazy(() =>
  import('./pages/WorkLibrary').then((m) => ({ default: m.CodeTasksPage })),
);
const KnowledgePage = lazy(() =>
  import('./pages/WorkLibrary').then((m) => ({ default: m.KnowledgePage })),
);
const RunsPage = lazy(() =>
  import('./pages/Monitoring').then((m) => ({ default: m.RunsPage })),
);
const AuditPage = lazy(() =>
  import('./pages/Monitoring').then((m) => ({ default: m.AuditPage })),
);
const SystemPage = lazy(() =>
  import('./pages/Monitoring').then((m) => ({ default: m.SystemPage })),
);
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ResourcesPage = lazy(() =>
  import('./pages/admin/AdminDashboard').then((m) => ({
    default: m.ResourcesPage,
  })),
);
const ModelsPage = lazy(() =>
  import('./pages/admin/Infrastructure').then((m) => ({
    default: m.ModelsPage,
  })),
);
const RoutingPage = lazy(() =>
  import('./pages/admin/Infrastructure').then((m) => ({
    default: m.RoutingPage,
  })),
);
const NodesPage = lazy(() =>
  import('./pages/admin/Infrastructure').then((m) => ({
    default: m.NodesPage,
  })),
);
const UsersPage = lazy(() =>
  import('./pages/admin/Governance').then((m) => ({ default: m.UsersPage })),
);
const UserDetailPage = lazy(() =>
  import('./pages/admin/Governance').then((m) => ({
    default: m.UserDetailPage,
  })),
);
const PermissionsPage = lazy(() =>
  import('./pages/admin/Governance').then((m) => ({
    default: m.PermissionsPage,
  })),
);
const TokensPage = lazy(() =>
  import('./pages/admin/Governance').then((m) => ({ default: m.TokensPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/admin/Governance').then((m) => ({ default: m.SettingsPage })),
);
function RunDetail() {
  const { id } = useParams();
  const { data } = useApp();
  const task = data?.tasks.find((t) => t.id === id);
  if (task?.type === 'general')
    return (
      <Navigate
        to={`/workspace/chats/${task.conversationId ?? task.id}`}
        replace
      />
    );
  return task?.type === 'code' ? <CodeWorkspace /> : <DocumentWorkflow />;
}
function ProtectedRoute({
  admin = false,
  permission = 'tasks',
  children,
}: {
  admin?: boolean;
  permission?: Permission;
  children: ReactNode;
}) {
  const { user, loading } = useApp();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && user.role !== 'admin')
    return <Navigate to="/workspace" replace />;
  if (!hasPermission(user, permission))
    return (
      <Empty message="Your account does not have access to this workspace." />
    );
  return children;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workbench render error', error, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <Empty
        message="The workspace could not be displayed."
        action={
          <Button onClick={() => window.location.reload()}>
            Reload workspace
          </Button>
        }
      />
    ) : (
      this.props.children
    );
  }
}
function HomeRedirect() {
  const { user, loading } = useApp();
  if (loading) return <Loading />;
  return (
    <Navigate
      to={!user ? '/login' : user.role === 'admin' ? '/admin' : '/workspace'}
      replace
    />
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/workspace"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ChatWorkspace />} />
              <Route path="new" element={<ChatWorkspace />} />
              <Route path="chats/:id" element={<ChatWorkspace />} />
              <Route
                path="documents"
                element={
                  <ProtectedRoute permission="documents">
                    <DocumentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="documents/:id"
                element={
                  <ProtectedRoute permission="documents">
                    <DocumentWorkflow />
                  </ProtectedRoute>
                }
              />
              <Route
                path="code"
                element={
                  <ProtectedRoute permission="code">
                    <CodeTasksPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="code/:id"
                element={
                  <ProtectedRoute permission="code">
                    <CodeWorkspace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="knowledge"
                element={
                  <ProtectedRoute permission="knowledge">
                    <KnowledgePage />
                  </ProtectedRoute>
                }
              />
              <Route path="runs" element={<RunsPage />} />
              <Route path="runs/:id" element={<RunDetail />} />
              <Route
                path="audit"
                element={<Navigate to="/workspace" replace />}
              />
              <Route path="system" element={<SystemPage />} />
            </Route>
            <Route
              path="/admin"
              element={
                <ProtectedRoute admin permission="admin">
                  <Layout admin />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="resources" element={<ResourcesPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="routing" element={<RoutingPage />} />
              <Route path="nodes" element={<NodesPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />
              <Route path="permissions" element={<PermissionsPage />} />
              <Route path="tokens" element={<TokensPage />} />
              <Route path="audit" element={<AuditPage admin />} />
              <Route path="security" element={<SystemPage security />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route
              path="*"
              element={
                <Empty
                  message="This page could not be found."
                  action={
                    <Button onClick={() => location.assign('/')}>
                      Return to workspace
                    </Button>
                  }
                />
              }
            />
          </Routes>
        </Suspense>
        <Toaster position="bottom-right" richColors closeButton />
      </AppProvider>
    </ErrorBoundary>
  );
}
