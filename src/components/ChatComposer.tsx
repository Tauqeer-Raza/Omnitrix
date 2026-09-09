import { useState, useRef, type SubmitEvent } from 'react';
import { ArrowUp, Paperclip, ShieldCheck, X, FileText } from 'lucide-react';
import { Button, ErrorMessage } from './common';
import FileUploader from './FileUploader';
import { documentApi } from '../api/documents';
import type { LocalDocument } from '../types';

export default function ChatComposer({
  prompt,
  onPromptChange,
  onSend,
  busy = false,
  disabled = false,
  followUp = false,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: (documents: LocalDocument[]) => Promise<boolean>;
  busy?: boolean;
  disabled?: boolean;
  followUp?: boolean;
}) {
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [attachments, setAttachments] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy || disabled || uploading) return;
    setError('');
    if (!prompt.trim()) {
      setError('Write a message to get started.');
      return;
    }
    if (await onSend(documents)) {
      setDocuments([]);
      setAttachments(false);
    }
  }
  return (
    <form
      ref={form}
      className={`chat-composer ${followUp ? 'follow-up-composer' : ''}`}
      onSubmit={submit}
    >
      {attachments && (
        <div className="chat-attachments">
          <div className="chat-attachment-heading">
            <span>Attach local files</span>
            <button
              className="icon-button"
              type="button"
              aria-label="Close attachments"
              onClick={() => setAttachments(false)}
            >
              <X size={16} />
            </button>
          </div>
          <FileUploader
            documents={documents}
            onChange={setDocuments}
            onBusy={setUploading}
          />
          <button
            type="button"
            className="chat-sample"
            disabled={uploading || documents.length >= 10}
            onClick={async () => {
              setError('');
              setUploading(true);
              try {
                const doc = await documentApi.addSample();
                setDocuments((d) => [...d, doc]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          >
            <FileText size={14} />
            Try with a sample report
          </button>
        </div>
      )}
      {!attachments && documents.length > 0 && (
        <div className="chat-attached-tags">
          {documents.map((doc) => (
            <span key={doc.id}>
              <FileText size={13} />
              {doc.name}
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove attachment ${doc.name}`}
                onClick={() =>
                  setDocuments((d) => d.filter((x) => x.id !== doc.id))
                }
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="chat-message">
        Message Omnitrix
      </label>
      <textarea
        id="chat-message"
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder={
          followUp
            ? 'Ask a follow-up or add more details…'
            : 'Ask a question, describe your work, or attach a document…'
        }
        rows={followUp ? 2 : 3}
        maxLength={8000}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            form.current?.requestSubmit();
          }
        }}
      />
      {error && <ErrorMessage message={error} />}
      <div className="chat-composer-bottom">
        <button
          type="button"
          className="chat-attach-button"
          onClick={() => setAttachments((v) => !v)}
          aria-expanded={attachments}
          disabled={busy || disabled}
        >
          <Paperclip size={17} />
          <span>Attach files</span>
        </button>
        <span className="chat-local-note">
          <ShieldCheck size={13} />
          Only on your network
        </span>
        <Button
          primary
          type="submit"
          loading={busy || uploading}
          disabled={disabled || busy || uploading}
          className="chat-send"
          aria-label="Send message"
        >
          <ArrowUp size={19} />
        </Button>
      </div>
    </form>
  );
}
