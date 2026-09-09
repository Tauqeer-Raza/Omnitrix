import { useEffect, useEffectEvent, useState, type CSSProperties } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Activity,
  ScrollText,
  Server,
  ShieldCheck,
  ChevronDown,
  LogOut,
  Bell,
  Settings,
  Boxes,
  GitBranch,
  Users,
  KeyRound,
  Gauge,
  Search,
  ArrowUpRight,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Brand, Modal, SearchField, SecureFooter, Button } from './common';
import { useApp } from '../state/AppContext';
import { hasPermission } from '../api/auth';
import { useWorkbenchTools } from '../hooks/useWorkbenchTools';
import type { Permission } from '../types';
import OperatorNavigation from './OperatorNavigation';
import { getConversations } from '../lib/conversations';
const adminNav = [
  {
    label: 'CONTROL CENTER',
    items: [
      ['Overview', '/admin', LayoutDashboard],
      ['Resource Usage', '/admin/resources', Gauge],
    ],
  },
  {
    label: 'AI INFRASTRUCTURE',
    items: [
      ['Models', '/admin/models', Boxes],
      ['Routing', '/admin/routing', GitBranch],
      ['Compute Nodes', '/admin/nodes', Server],
    ],
  },
  {
    label: 'GOVERNANCE',
    items: [
      ['Users', '/admin/users', Users],
      ['Permissions', '/admin/permissions', KeyRound],
      ['Token & Resource Limits', '/admin/tokens', Gauge],
    ],
  },
  {
    label: 'SECURITY',
    items: [
      ['Audit Logs', '/admin/audit', ScrollText],
      ['Security Status', '/admin/security', ShieldCheck],
    ],
  },
  { label: 'SYSTEM', items: [['Settings', '/admin/settings', Settings]] },
];
function Navigation({
  admin,
  onSearch,
}: {
  admin: boolean;
  onSearch: () => void;
}) {
  const { user } = useApp();
  const { setOpen, setOpenMobile } = useSidebar();
  const location = useLocation();
  const applyViewport = useEffectEvent((matches: boolean) => setOpen(!matches));
  useEffect(() => {
    const query = matchMedia('(min-width: 768px) and (max-width: 1100px)');
    const apply = () => applyViewport(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  useEffect(() => setOpenMobile(false), [location.pathname, setOpenMobile]);
  if (!admin) return <OperatorNavigation onSearch={onSearch} />;
  return (
    <>
      <SidebarHeader className="brand-header">
        <Link
          to={admin ? '/admin' : '/workspace'}
          aria-label="Omnitrix overview"
        >
          <Brand />
        </Link>
      </SidebarHeader>
      <SidebarContent className="nav-content">
        {adminNav.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-group-title">{group.label}</div>
            {group.items.map(([label, path, Icon, permission]) => {
              const I = Icon as typeof LayoutDashboard;
              if (permission && !hasPermission(user, permission as Permission))
                return null;
              return (
                <NavLink
                  title={String(label)}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                  key={String(path)}
                  to={String(path)}
                  end={path === '/workspace' || path === '/admin'}
                >
                  <I size={18} />
                  <span>{String(label)}</span>
                  {label === 'Documents' && <em>04</em>}
                  {label === 'Agent Runs' && <i className="nav-live" />}
                </NavLink>
              );
            })}
          </div>
        ))}
      </SidebarContent>
      <SidebarFooter className="sidebar-bottom">
        <div className="sovereign-tag">
          <span className="status-dot" />
          <b>SOVEREIGN MODE</b>
          <ShieldCheck size={15} />
        </div>
        <div className="sidebar-footnote">
          <span>LOCAL. SECURE. YOURS.</span>
          <span>V 1.0</span>
        </div>
      </SidebarFooter>
    </>
  );
}
export default function Layout({ admin = false }: { admin?: boolean }) {
  useWorkbenchTools();
  const { user, data, logout } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [profile, setProfile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setProfile(false);
  }, [location.pathname]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  const section =
    location.pathname.split('/')[2]?.replaceAll('-', ' ') || 'Overview';
  return (
    <SidebarProvider
      className={admin ? '' : 'operator-shell'}
      style={
        {
          '--sidebar-width': '230px',
          '--sidebar-width-icon': '70px',
        } as CSSProperties
      }
    >
      <Sidebar collapsible="icon" className="omni-sidebar">
        <Navigation admin={admin} onSearch={() => setSearchOpen(true)} />
      </Sidebar>
      <div className="app-main">
        <header className="topbar">
          {admin ? (
            <div className="breadcrumb">
              <SidebarTrigger className="sidebar-toggle" />
              <span>{admin ? 'Control center' : 'Workspace'}</span>
              <span className="breadcrumb-slash">/</span>
              <b>{section}</b>
            </div>
          ) : (
            <div className="operator-top-navigation">
              <SidebarTrigger className="sidebar-toggle" />
              <nav aria-label="Workspace navigation">
                <NavLink
                  to="/workspace"
                  end
                  className={() =>
                    !['knowledge', 'runs', 'system'].includes(section)
                      ? 'active'
                      : ''
                  }
                >
                  Chat
                </NavLink>
                {hasPermission(user, 'knowledge') && (
                  <NavLink to="/workspace/knowledge">Knowledge Base</NavLink>
                )}
                <NavLink to="/workspace/runs">Agent Runs</NavLink>
              </nav>
            </div>
          )}
          <div className="topbar-right">
            <span className="topbar-secure">
              <span className="status-dot" />
              LOCAL ENVIRONMENT
            </span>
            <span className="demo-label">DEMO</span>
            <button
              className="command-button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search workspace"
            >
              <Search size={17} />
              <kbd>⌘ K</kbd>
            </button>
            {admin && (
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                onClick={() => setNotifications(true)}
              >
                <Bell size={18} />
                <i />
              </button>
            )}
            <div className="profile-wrap">
              <button
                className="profile-button"
                onClick={() => setProfile((v) => !v)}
                aria-expanded={profile}
              >
                <span className="avatar">{admin ? 'AD' : 'OP'}</span>
                <span>
                  {user?.name}
                  <small>{user?.department}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {profile && (
                <div className="profile-menu">
                  <p>{user?.email}</p>
                  {!admin && (
                    <Link
                      className="operator-status-link"
                      to="/workspace/system"
                    >
                      <Server size={14} />
                      System status
                    </Link>
                  )}
                  <Button
                    onClick={async () => {
                      await logout();
                      void navigate('/login');
                    }}
                  >
                    <LogOut size={15} />
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </header>
        {data?.settings.offline && (
          <div className="offline-banner">
            <span>LOCAL BACKEND OFFLINE · Task execution is paused.</span>
            <Link to={admin ? '/admin/settings' : '/workspace/system'}>
              Reconnect <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        <main className="page-content" key={location.pathname}>
          <Outlet />
        </main>
        <SecureFooter />
      </div>
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search the workbench"
        description={
          admin
            ? 'Find local tasks and workspaces.'
            : 'Find and continue a previous conversation.'
        }
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={admin ? 'Search tasks…' : 'Search conversations…'}
        />
        <div className="search-results">
          {(admin ? (data?.tasks ?? []) : getConversations(data?.tasks ?? []))
            .filter((t) => t.title.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 50)
            .map((t) => (
              <Link
                key={t.id}
                to={
                  admin ? `/workspace/runs/${t.id}` : `/workspace/chats/${t.id}`
                }
                onClick={() => setSearchOpen(false)}
              >
                <FileText size={17} />
                <span>
                  {t.title}
                  <small>
                    {admin && 'status' in t
                      ? t.status
                      : 'Continue conversation'}
                  </small>
                </span>
                <ArrowUpRight size={15} />
              </Link>
            ))}
          {!data?.tasks.some((t) =>
            t.title.toLowerCase().includes(search.toLowerCase()),
          ) && <p>No matching tasks.</p>}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="System notifications"
        description="Latest activity in your local workspace."
      >
        <div className="notification-list">
          {data?.audit.slice(0, 6).map((a) => (
            <div key={a.id}>
              <Activity size={16} />
              <span>
                <b>{a.action.replaceAll('_', ' ')}</b>
                <small>{a.resource}</small>
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </SidebarProvider>
  );
}
