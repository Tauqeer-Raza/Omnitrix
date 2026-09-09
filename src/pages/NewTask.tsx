import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  SquareCode,
  ArrowUpRight,
  ShieldCheck,
  ArrowLeft,
  Lock,
  Layers,
  Check,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApp } from '../state/AppContext';
import { taskApi } from '../api/tasks';
import { documentApi } from '../api/documents';
import {
  Button,
  PageHeader,
  ResourceMeter,
  ErrorMessage,
  Picker,
} from '../components/common';
import FileUploader from '../components/FileUploader';
import SovereigntyConsole from '../components/SovereigntyConsole';
import type { LocalDocument, Scenario } from '../types';
export default function NewTask() {
  const location = useLocation();
  const initial = location.state as {
    prompt?: string;
    type?: 'document' | 'code';
  } | null;
  const [type, setType] = useState<'document' | 'code'>(
    initial?.type ?? 'document',
  );
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [title, setTitle] = useState('');
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const { user, refresh } = useApp();
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const task = await taskApi.createTask({
        prompt,
        title,
        type,
        documentIds: type === 'document' ? documents.map((d) => d.id) : [],
        scenario,
      });
      await refresh();
      navigate(`/workspace/${type === 'code' ? 'code' : 'runs'}/${task.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to="/workspace" className="breadcrumb-back">
        <ArrowLeft size={13} />
        Back to workspace
      </Link>
      <PageHeader
        eyebrow="WORKSPACE / CREATE"
        title="New task"
        description="Start a secure AI workflow."
      />
      <div className="new-task-layout">
        <form onSubmit={submit} className="panel new-task-form">
          <div className="section-title">
            <Layers size={16} />
            DEFINE YOUR WORKFLOW <span className="count-tag">01</span>
          </div>
          <Tabs
            value={type}
            onValueChange={(v) => {
              setType(v as 'document' | 'code');
              setScenario('normal');
            }}
          >
            <TabsList className="task-choice-list">
              <TabsTrigger value="document" className="task-choice">
                <FileText size={20} />
                <span>
                  <b>Document task</b>
                  <small>Analyze, compare & create</small>
                </span>
              </TabsTrigger>
              <TabsTrigger value="code" className="task-choice">
                <SquareCode size={20} />
                <span>
                  <b>Coding task</b>
                  <small>Calculate, generate & test</small>
                </span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="task-title-field">
            Task name <span className="muted">Optional</span>
            <input
              placeholder={
                type === 'document'
                  ? 'e.g. Inspection Report Analysis'
                  : 'e.g. Pressure Drop Calculation'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            What would you like Omnitrix to accomplish?
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={8000}
              rows={5}
              placeholder={
                type === 'document'
                  ? 'Review the attached inspection report. Summarize findings and prepare a draft approval note with source references.'
                  : 'Calculate pipeline pressure drop. State the assumptions and include validation tests.'
              }
            />
          </label>
          <div className="prompt-examples">
            <span>TRY A WORKFLOW</span>
            {(type === 'document'
              ? ['Inspection analysis', 'SOP comparison']
              : ['Pressure drop', 'Data validation']
            ).map((label) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  setTitle(
                    label === 'Inspection analysis'
                      ? 'Inspection Report Analysis'
                      : label,
                  );
                  setPrompt(
                    type === 'document'
                      ? `Perform ${label.toLowerCase()} on the attached documents. Identify discrepancies, cite sources, and generate a draft report for human review.`
                      : `Create Python code for ${label.toLowerCase()}. Use a 120 m pipe, diameter 0.15 m, flow 0.025 m³/s, fluid density 998 kg/m³, and a friction factor of 0.02. Include input validation and unit tests.`,
                  );
                }}
              >
                {label}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
          {type === 'document' && (
            <div className="attachment-section">
              <div className="section-title">
                <FileText size={15} />
                LOCAL DOCUMENTS
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const d = await documentApi.addSample();
                      setDocuments((prev) => [...prev, d]);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                  disabled={documents.length >= 10}
                >
                  Use sample report
                </Button>
              </div>
              <FileUploader
                documents={documents}
                onChange={setDocuments}
                onBusy={setUploading}
              />
            </div>
          )}
          <details className="simulation-details">
            <summary>Demo simulation options</summary>
            <p>
              Processing uses synthetic data. Uploaded files stay in this
              browser; real OCR, reasoning, and sandbox execution require the
              backend.
            </p>
            <Picker
              label="Simulation scenario"
              value={scenario}
              onChange={(v) => setScenario(v as Scenario)}
              options={[
                { value: 'normal', label: 'Successful workflow' },
                ...(type === 'document'
                  ? [{ value: 'rag_failure', label: 'Local knowledge failure' }]
                  : [
                      {
                        value: 'sandbox_failure',
                        label: 'Sandbox test failure',
                      },
                    ]),
              ]}
            />
          </details>
          {error && <ErrorMessage message={error} />}
          <div className="task-submit-row">
            <span>
              <Lock size={13} />
              LOCAL PROCESSING · AUDIT LOGGED
            </span>
            <Button primary type="submit" loading={busy} disabled={uploading}>
              {busy ? 'Creating workflow…' : 'Start task'}
              <ArrowUpRight size={17} />
            </Button>
          </div>
        </form>
        <div className="stack task-side">
          <SovereigntyConsole compact />
          <div className="panel">
            <div className="section-title">
              <ShieldCheck size={15} />
              YOUR WORKSPACE ALLOCATION
            </div>
            {user && <ResourceMeter used={user.used} total={user.dailyLimit} />}
            <p className="note">
              Each demo workflow reserves 2,400 tokens. Allocation is applied
              when the task completes.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
