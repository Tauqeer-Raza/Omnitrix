import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  FileText,
  ArrowUpRight,
  Trash2,
  BookOpen,
  Search,
  ShieldCheck,
  SquareCode,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { documentApi } from '../api/documents';
import {
  Button,
  PageHeader,
  SearchField,
  DataTable,
  StatusBadge,
  Empty,
  Modal,
  ConfirmModal,
  dateTime,
} from '../components/common';
import FileUploader from '../components/FileUploader';
import type { LocalDocument } from '../types';
export function DocumentsPage() {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const docs = (data?.documents ?? []).filter((d) =>
    d.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="WORK / DOCUMENTS"
        title="Document library"
        description="Your confidential files and generated deliverables, in one local workspace."
        action={
          <Button primary onClick={() => navigate('/workspace/new')}>
            <Plus size={15} />
            New document task
          </Button>
        }
      />
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search documents…"
        />
        <span className="note">
          <ShieldCheck size={14} />
          {docs.length} local documents
        </span>
      </div>
      <DataTable
        headers={['DOCUMENT', 'TYPE', 'SIZE', 'STATUS', 'UPDATED', '']}
        rows={docs.map((d) => ({
          id: d.id,
          cells: [
            <Link
              key="cell-0"
              className="document-table-name"
              to={`/workspace/documents/${d.id}`}
            >
              <FileText size={20} />
              <span>
                <strong>{d.name}</strong>
                <small className="cell-subtitle">
                  {d.source === 'sample' ? 'Synthetic source' : 'Local upload'}
                </small>
              </span>
            </Link>,
            <span key="cell-1" className="badge-outline">
              {d.type}
            </span>,
            `${(d.size / 1024 / 1024).toFixed(1)} MB`,
            <StatusBadge key="cell-3" status={d.status} />,
            <span key="cell-4" className="mono">
              {d.updated}
            </span>,
            <Link
              key="cell-5"
              className="text-link"
              to={`/workspace/documents/${d.id}`}
            >
              Open
              <ArrowUpRight size={14} />
            </Link>,
          ],
        }))}
      />
      <p className="note">
        <ShieldCheck size={14} />
        Files are local to this browser in demo mode. Generated deliverables are
        available from completed tasks.
      </p>
    </>
  );
}
export function CodeTasksPage() {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        eyebrow="WORK / CODE"
        title="Code tasks"
        description="Local calculations, reproducible scripts, and sandbox execution records."
        action={
          <Button
            primary
            onClick={() =>
              navigate('/workspace/new', { state: { type: 'code' } })
            }
          >
            <Plus size={15} />
            New coding task
          </Button>
        }
      />
      <div className="toolbar">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search code tasks…"
        />
      </div>
      <DataTable
        headers={['TASK', 'STATUS', 'MODEL', 'STARTED', '']}
        rows={(data?.tasks ?? [])
          .filter(
            (t) =>
              t.type === 'code' &&
              t.title.toLowerCase().includes(query.toLowerCase()),
          )
          .map((t) => ({
            id: t.id,
            cells: [
              <Link
                key="cell-0"
                className="document-table-name"
                to={`/workspace/code/${t.id}`}
              >
                <SquareCode size={20} />
                <strong>{t.title}</strong>
              </Link>,
              <StatusBadge key="cell-1" status={t.status} />,
              <span key="cell-2" className="mono">
                {data?.models.find((m) => m.id === t.modelId)?.name}
              </span>,
              dateTime(t.started),
              <Link key="cell-4" to={`/workspace/code/${t.id}`}>
                <ArrowUpRight size={16} />
                <span className="sr-only">Open {t.title}</span>
              </Link>,
            ],
          }))}
      />
    </>
  );
}
export function KnowledgePage() {
  const { data, act } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Awaited<
    ReturnType<typeof documentApi.search>
  > | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [add, setAdd] = useState(false);
  const [files, setFiles] = useState<LocalDocument[]>([]);
  const [remove, setRemove] = useState<LocalDocument | null>(null);
  const docs = (data?.documents ?? []).filter((d) => d.knowledge);
  async function search() {
    setSearching(true);
    setSearchError('');
    try {
      setResults(await documentApi.search(query));
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="WORK / LOCAL ORGANIZATIONAL KNOWLEDGE"
        title="Knowledge base"
        description="Search the references your organization trusts. Every source stays local."
        action={
          <Button primary onClick={() => setAdd(true)}>
            <Plus size={15} />
            Add documents
          </Button>
        }
      />
      <div className="knowledge-banner">
        <BookOpen size={29} />
        <div>
          <span className="eyebrow">LOCAL VECTOR STORE</span>
          <h2>
            {docs.length} documents. {docs.reduce((s, d) => s + d.chunks, 0)}{' '}
            searchable chunks.
          </h2>
          <p>
            Engineering manuals, inspection records, and organizational
            procedures.
          </p>
        </div>
        <StatusBadge status="online" />
      </div>
      <form
        className="knowledge-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search your local knowledge…"
        />
        <Button primary type="submit" loading={searching}>
          <Search size={15} />
          Search
        </Button>
        {results && (
          <Button
            type="button"
            onClick={() => {
              setResults(null);
              setQuery('');
            }}
          >
            Clear
          </Button>
        )}
      </form>
      {searchError && (
        <p className="error-message" role="alert">
          {searchError}
        </p>
      )}
      {results !== null ? (
        <div className="knowledge-results">
          <div className="section-heading">
            <span className="eyebrow">{results.length} LOCAL RESULTS</span>
            <small className="muted">Synthetic search index</small>
          </div>
          {results.length ? (
            results.map((r) => (
              <Link
                to={`/workspace/documents/${r.document.id}`}
                className="knowledge-result"
                key={r.document.id}
              >
                <div>
                  <FileText size={19} />
                  <h3>{r.document.name}</h3>
                  <span>{Math.round(r.relevance * 100)}% relevance</span>
                </div>
                <p>{r.content}</p>
                <footer>
                  PAGE {r.page} · LOCAL DOCUMENT
                  <ArrowUpRight size={14} />
                </footer>
              </Link>
            ))
          ) : (
            <Empty message="No local sources matched your search." />
          )}
        </div>
      ) : (
        <DataTable
          headers={['DOCUMENT', 'TYPE', 'CHUNKS', 'STATUS', 'LAST UPDATED', '']}
          rows={docs.map((d) => ({
            id: d.id,
            cells: [
              <Link
                key="cell-0"
                className="document-table-name"
                to={`/workspace/documents/${d.id}`}
              >
                <FileText size={19} />
                <strong>{d.name}</strong>
              </Link>,
              d.type,
              <span key="cell-2" className="mono">
                {d.chunks}
              </span>,
              <StatusBadge key="cell-3" status={d.status} />,
              <span key="cell-4" className="mono">
                {d.updated}
              </span>,
              <div key="cell-5" className="table-actions">
                <Link
                  className="glass-button"
                  to={`/workspace/documents/${d.id}`}
                >
                  Open
                  <ArrowUpRight size={13} />
                </Link>
                <button
                  className="icon-button"
                  aria-label={`Remove ${d.name}`}
                  onClick={() => setRemove(d)}
                >
                  <Trash2 size={15} />
                </button>
              </div>,
            ],
          }))}
        />
      )}
      <p className="note">
        <ShieldCheck size={14} />
        Indexed content is simulated in this demo. Original uploads remain
        available in the local document library.
      </p>
      <Modal
        open={add}
        onClose={() => setAdd(false)}
        title="Add local knowledge"
        description="Upload organizational documents. The demo indexes synthetic content."
      >
        <FileUploader documents={files} onChange={setFiles} knowledge />
        <div className="modal-actions">
          <Button onClick={() => setAdd(false)}>Done</Button>
        </div>
      </Modal>
      <ConfirmModal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Remove local document?"
        description={`${remove?.name ?? 'This file'} will be removed from the knowledge base and local storage.`}
      >
        <p className="note">Completed audit records remain available.</p>
        <div className="modal-actions">
          <Button onClick={() => setRemove(null)}>Keep document</Button>
          <Button
            className="danger-button"
            onClick={async () => {
              if (remove) {
                await act(
                  () => documentApi.remove(remove.id),
                  'Document removed',
                );
                setRemove(null);
              }
            }}
          >
            Remove document
          </Button>
        </div>
      </ConfirmModal>
    </>
  );
}
