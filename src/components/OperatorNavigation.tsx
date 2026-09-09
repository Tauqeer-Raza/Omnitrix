import { Link, NavLink } from 'react-router-dom';
import { Plus, Search, MessageSquare, ShieldCheck, Gauge } from 'lucide-react';
import {
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Progress } from '@/components/ui/progress';
import { Brand, number } from './common';
import { useApp } from '../state/AppContext';
import { getConversations } from '../lib/conversations';
export default function OperatorNavigation({
  onSearch,
}: {
  onSearch: () => void;
}) {
  const { user, data } = useApp();
  const chats = getConversations(data?.tasks ?? []);
  const remaining = Math.max(0, (user?.dailyLimit ?? 0) - (user?.used ?? 0));
  const percentage = Math.min(
    100,
    ((user?.used ?? 0) / Math.max(user?.dailyLimit ?? 1, 1)) * 100,
  );
  return (
    <>
      <SidebarHeader className="brand-header">
        <Link to="/workspace" aria-label="Omnitrix home">
          <Brand />
        </Link>
      </SidebarHeader>
      <SidebarContent className="operator-nav-content">
        <Link
          className="operator-new-chat glass-button primary"
          to="/workspace/new"
          title="New chat"
        >
          <Plus size={17} />
          <span>New chat</span>
        </Link>
        <button
          className="operator-search"
          onClick={onSearch}
          title="Search chats"
        >
          <Search size={16} />
          <span>Search chats</span>
        </button>
        <div className="operator-history-heading">RECENT CHATS</div>
        <nav className="operator-chat-history" aria-label="Previous chats">
          {chats.slice(0, 20).map((chat) => (
            <NavLink
              title={chat.title}
              key={chat.id}
              to={`/workspace/chats/${chat.id}`}
              className={({ isActive }) =>
                `operator-chat-link ${isActive ? 'active' : ''}`
              }
            >
              <MessageSquare size={15} />
              <span>{chat.title}</span>
              {chat.running && <i aria-label="In progress" />}
            </NavLink>
          ))}
          {chats.length === 0 && (
            <p className="operator-no-chats">
              Your conversations will appear here.
            </p>
          )}
        </nav>
        {chats.length > 20 && (
          <button className="operator-all-chats" onClick={onSearch}>
            View all chats
          </button>
        )}
      </SidebarContent>
      <SidebarFooter className="operator-sidebar-footer">
        <div
          className="operator-allocation"
          aria-label="AI resource allocation"
        >
          <div className="operator-allocation-title">
            <Gauge size={15} />
            <span>AI RESOURCE</span>
          </div>
          <div className="operator-allocation-details">
            <strong>
              {number(remaining)}
              <span>tokens remaining</span>
            </strong>
            <Progress
              value={percentage}
              aria-label={`${number(user?.used ?? 0)} tokens used of ${number(user?.dailyLimit ?? 0)}`}
            />
            <dl>
              <div>
                <dt>Used</dt>
                <dd>{number(user?.used ?? 0)}</dd>
              </div>
              <div>
                <dt>Daily allocation</dt>
                <dd>{number(user?.dailyLimit ?? 0)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="operator-sovereign">
          <ShieldCheck size={14} />
          <span>Sovereign mode</span>
          <i />
        </div>
      </SidebarFooter>
    </>
  );
}
