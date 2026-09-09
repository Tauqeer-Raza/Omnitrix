import {
  useEffect,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import {
  Check,
  ChevronRight,
  LoaderCircle,
  AlertTriangle,
  Search,
  Inbox,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty as EmptyPrimitive } from '@/components/ui/empty';
export const number = (n: number) => new Intl.NumberFormat('en-IN').format(n);
export const time = (date: string) =>
  new Date(date).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export const dateTime = (date: string) =>
  new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <span />
        <span />
      </span>
      <span className="brand-copy">
        <b>
          OMNITRIX<span className="brand-dot">®</span>
        </b>
        <small>SOVEREIGN AI WORKBENCH</small>
      </span>
    </div>
  );
}
export function Button({
  children,
  className = '',
  primary = false,
  loading = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={`glass-button ${primary ? 'primary' : ''} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {status.replaceAll('_', ' ')}
    </span>
  );
}
export function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let frame: number;
    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min((now - start) / 600, 1);
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{number(shown)}</>;
}
export function SectionHeading({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{label}</span>
        {children}
      </div>
      {action}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow orange">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function MetricCard({
  label,
  value,
  detail,
  icon,
  orange = false,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  orange?: boolean;
}) {
  return (
    <div className={`metric-card ${orange ? 'metric-orange' : ''}`}>
      <div className="metric-top">
        <span className="eyebrow">{label}</span>
        {icon}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">
        <span className="tiny-dot" />
        {detail}
        <MiniBars />
      </div>
    </div>
  );
}
export function MiniBars() {
  return (
    <div className="mini-bars" aria-hidden="true">
      {[25, 47, 37, 64, 55, 79, 62, 91, 72, 100].map((n, i) => (
        <i key={i} style={{ height: `${n}%`, animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
export function ResourceMeter({
  used,
  total,
  label = 'AI RESOURCE',
  dark = false,
}: {
  used: number;
  total: number;
  label?: string;
  dark?: boolean;
}) {
  const percent = Math.min(100, Math.round((used / Math.max(total, 1)) * 100));
  return (
    <div className={`resource-meter ${dark ? 'dark-meter' : ''}`}>
      <div className="section-heading">
        <span className="eyebrow">{label}</span>
        <span className="mono">{percent}%</span>
      </div>
      <Progress value={percent} aria-label={`${label}: ${percent}% used`} />
      <div className="resource-numbers">
        <b>{number(used)}</b>
        <span>/ {number(total)} tokens</span>
      </div>
      <small>
        {number(Math.max(0, total - used))} remaining · resets at midnight
      </small>
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="omni-modal">
        <DialogTitle className="modal-title">{title}</DialogTitle>
        <DialogDescription>
          {description ?? 'Changes are saved to this local demo.'}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <AlertDialogContent className="omni-modal">
        <AlertDialogTitle className="modal-title">{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {children}
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(String(v));
      }}
    >
      <SelectTrigger className="picker" aria-label={label}>
        <SelectValue>
          {options
            .map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
            .find((o) => o.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function DataTable({
  headers,
  rows,
  empty = 'No records found.',
}: {
  headers: string[];
  rows: { id: string; cells: ReactNode[] }[];
  empty?: string;
}) {
  return (
    <div className="data-table">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {r.cells.map((c, i) => (
                <TableCell key={i}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <Empty message={empty} />}
    </div>
  );
}
export function Empty({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <EmptyPrimitive className="empty-state">
      <Inbox size={30} />
      <p>{message}</p>
      {action}
    </EmptyPrimitive>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" />
      <span>Loading local workspace…</span>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <AlertTriangle size={18} />
      <span>{message}</span>
      {retry && <Button onClick={retry}>Retry</Button>}
    </div>
  );
}
export function SecureFooter() {
  return (
    <footer className="secure-footer">
      <span>
        <ShieldCheck size={13} />
        ALL OPERATIONS REMAIN WITHIN YOUR NETWORK
      </span>
      <span>
        OMNITRIX / V.1.0.0 <span className="orange">●</span>
      </span>
    </footer>
  );
}
export { Check, ChevronRight, ArrowUpRight };
