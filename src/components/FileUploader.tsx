import { useRef, useState } from 'react';
import { UploadCloud, FileText, X, Check, RotateCcw } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { documentApi } from '../api/documents';
import type { LocalDocument } from '../types';
import { ErrorMessage } from './common';
interface UploadItem {
  id: string;
  file: File;
  progress: number;
  error?: string;
  document?: LocalDocument;
}
export default function FileUploader({
  documents,
  onChange,
  knowledge = false,
  onBusy,
}: {
  documents: LocalDocument[];
  onChange: (docs: LocalDocument[]) => void;
  knowledge?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const docsRef = useRef(documents);
  docsRef.current = documents;
  const active = useRef(0);
  async function upload(item: UploadItem) {
    active.current++;
    onBusy?.(true);
    try {
      const document = await documentApi.upload(
        item.file,
        (p) =>
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, progress: p, error: undefined } : i,
            ),
          ),
        knowledge,
      );
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onChange([...docsRef.current, document]);
      docsRef.current = [...docsRef.current, document];
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, error: (e as Error).message } : i,
        ),
      );
    } finally {
      active.current--;
      onBusy?.(active.current > 0);
    }
  }
  function add(files: FileList | File[]) {
    setError('');
    const all = Array.from(files);
    if (all.length + documents.length + items.length > 10) {
      setError('Attach up to 10 documents per task.');
      return;
    }
    const next = all.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
    }));
    setItems((prev) => [...prev, ...next]);
    next.forEach((item) => void upload(item));
  }
  return (
    <div>
      <input
        ref={ref}
        className="sr-only"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.docx"
        multiple
        aria-label="Upload documents"
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className={`upload-zone ${drag ? 'drag-active' : ''}`}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
      >
        <span className="upload-icon">
          <UploadCloud size={25} />
        </span>
        <b>Drop your documents here</b>
        <span>
          or <u>browse local files</u>
        </span>
        <small>PDF, PNG, JPG, DOCX · 20 MB per file · up to 10 files</small>
      </button>
      {error && <ErrorMessage message={error} />}
      <div className="upload-list">
        {documents.map((doc) => (
          <div key={doc.id} className="upload-item">
            <FileText size={20} />
            <div>
              <b>{doc.name}</b>
              <small>
                {(doc.size / 1024 / 1024).toFixed(1)} MB · stored locally
              </small>
            </div>
            <Check size={15} />
            <button
              type="button"
              className="icon-button"
              onClick={() => onChange(documents.filter((d) => d.id !== doc.id))}
              aria-label={`Remove attachment ${doc.name}`}
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {items.map((item) => (
          <div key={item.id} className="upload-item">
            <FileText size={20} />
            <div>
              <b>{item.file.name}</b>
              {item.error ? (
                <small className="orange">{item.error}</small>
              ) : (
                <Progress
                  value={item.progress}
                  aria-label={`Uploading ${item.file.name}`}
                />
              )}
            </div>
            {item.error ? (
              <>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void upload(item)}
                  aria-label={`Retry ${item.file.name}`}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() =>
                    setItems((p) => p.filter((i) => i.id !== item.id))
                  }
                  aria-label={`Dismiss ${item.file.name}`}
                >
                  <X size={15} />
                </button>
              </>
            ) : (
              <small>{item.progress}%</small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
