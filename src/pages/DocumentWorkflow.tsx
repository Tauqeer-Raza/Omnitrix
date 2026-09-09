import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Check,
  FileText,
  ArrowRight,
  ShieldCheck,
  Clock,
  Workflow,
  BookOpen,
  ArrowUpRight,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useApp } from '../state/AppContext';
import { taskApi } from '../api/tasks';
import { exportReport, exportSupplement } from '../api/exports';
import {
  Button,
  PageHeader,
  StatusBadge,
  SectionHeading,
  Empty,
  ErrorMessage,
  Picker,
} from '../components/common';
import DocumentViewer, { PaperReport } from '../components/DocumentViewer';
import AgentTimeline from '../components/AgentTimeline';
import SovereigntyConsole from '../components/SovereigntyConsole';
export default function DocumentWorkflow() {
  const { id } = useParams();
  const { data, act } = useApp();
  const [tab, setTab] = useState('workspace');
  const [selectedDoc, setSelectedDoc] = useState('');
  const [downloading, setDownloading] = useState('');
  const navigate = useNavigate();
  const task = data?.tasks.find(
    (t) => t.id === id || t.documentIds.includes(id ?? ''),
  );
  const source = data?.documents.find((d) => d.id === id);
  if (!data) return null;
  if (!task) {
    if (source)
      return (
        <>
          <PageHeader
            title={source.name}
            eyebrow="LOCAL DOCUMENT"
            action={
              <Button primary onClick={() => navigate('/workspace/new')}>
                Create task
                <ArrowUpRight size={16} />
              </Button>
            }
          />
          <div className="standalone-document">
            <DocumentViewer document={source} />
          </div>
        </>
      );
    return <Empty message="This document or task is unavailable." />;
  }
  const documents = data.documents.filter((d) =>
    task.documentIds.includes(d.id),
  );
  const document = documents.find((d) => d.id === selectedDoc) ?? documents[0];
  const complete = task.status === 'completed';
  async function download(format: 'pdf' | 'docx') {
    setDownloading(format);
    await act(
      () => exportReport(task!, documents, format),
      'Document downloaded',
    );
    setDownloading('');
  }
  return (
    <>
      <Link to="/workspace/runs" className="breadcrumb-back">
        <ArrowLeft size={13} />
        All agent runs<span>/</span>
        <span className="mono">{task.id.toUpperCase()}</span>
      </Link>
      <PageHeader
        eyebrow="DOCUMENT WORKFLOW"
        title={task.title}
        description="Local document intelligence, with a complete execution record."
        action={
          <div className="inline-actions">
            <StatusBadge status={task.status} />
            {['running', 'queued'].includes(task.status) && (
              <Button
                onClick={() =>
                  void act(() => taskApi.cancel(task.id), 'Task cancelled')
                }
              >
                Cancel task
              </Button>
            )}
          </div>
        }
      />
      <div className="workflow-meta">
        <span>
          <ShieldCheck size={13} />
          SOVEREIGN MODE
        </span>
        <span>
          <Clock size={13} />
          {task.duration}s elapsed
        </span>
        <span>
          <Workflow size={13} />
          8-step workflow
        </span>
        <span className="demo-label">SIMULATED PROCESSING</span>
      </div>
      {task.error && (
        <ErrorMessage
          message={task.error}
          retry={() => void act(() => taskApi.retry(task.id), 'Task restarted')}
        />
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList variant="line" className="workflow-tabs">
          <TabsTrigger value="workspace">Agent workspace</TabsTrigger>
          <TabsTrigger value="output" disabled={!complete}>
            Output & deliverables {complete && <Check size={13} />}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="workspace">
          <div className="document-workflow">
            <div>
              {documents.length > 1 && (
                <Picker
                  value={document.id}
                  onChange={setSelectedDoc}
                  options={documents.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                  label="Input document"
                />
              )}
              <DocumentViewer document={document} />
            </div>
            <section className="agent-workspace">
              <div className="agent-panel">
                <SectionHeading
                  label="AGENT ACTIVITY"
                  action={
                    <span className="mono">
                      {Math.max(0, task.step + 1)} / 8
                    </span>
                  }
                />
                <AgentTimeline task={task} />
              </div>
              <div className="context-panel">
                <SectionHeading
                  label="RETRIEVED CONTEXT"
                  action={<BookOpen size={15} />}
                />
                {task.step >= 4 && task.scenario !== 'rag_failure' ? (
                  <>
                    <div className="context-item">
                      <div>
                        <FileText size={13} />
                        <b>Pipeline Safety SOP.pdf</b>
                        <span>98%</span>
                      </div>
                      <p>
                        Pressure boundary inspections require instrument
                        calibration records and traceable test conditions.
                      </p>
                      <footer>
                        <span>PAGE 04 · CHUNK 028</span>
                        <span>SYNTHETIC REFERENCE</span>
                      </footer>
                    </div>
                    <div className="context-item">
                      <div>
                        <FileText size={13} />
                        <b>Maintenance Manual.pdf</b>
                        <span>94%</span>
                      </div>
                      <p>
                        Record localized oxidation and refer acceptance criteria
                        to the responsible engineer.
                      </p>
                      <footer>
                        <span>PAGE 12 · CHUNK 086</span>
                        <span>LOCAL VECTOR STORE</span>
                      </footer>
                    </div>
                  </>
                ) : (
                  <p className="context-placeholder">
                    Relevant local references will appear after knowledge
                    retrieval.
                  </p>
                )}
              </div>
              <div className="workflow-output">
                <SectionHeading label="OUTPUT" />
                {complete ? (
                  <>
                    <div className="output-ready">
                      <span>
                        <Check size={20} />
                      </span>
                      <div>
                        <b>Your draft report is ready.</b>
                        <p>Review the generated document and its references.</p>
                      </div>
                    </div>
                    <Button primary onClick={() => setTab('output')}>
                      Review output
                      <ArrowUpRight size={15} />
                    </Button>
                  </>
                ) : (
                  <p className="context-placeholder">
                    The report will be available after all processing steps
                    complete.
                  </p>
                )}
              </div>
            </section>
            <SovereigntyConsole task={task} />
          </div>
        </TabsContent>
        <TabsContent value="output">
          <div className="completion-banner">
            <span className="complete-check">
              <Check size={28} />
            </span>
            <div>
              <span className="eyebrow">WORKFLOW COMPLETE / {task.id}</span>
              <h2>
                From raw information.
                <br />
                To a reviewable result.
              </h2>
              <p>Generated locally. Referenced. Ready for human review.</p>
            </div>
            <div className="completion-downloads">
              <Button
                primary
                loading={downloading === 'docx'}
                onClick={() => void download('docx')}
              >
                <Download size={16} />
                Download Word
              </Button>
              <Button
                loading={downloading === 'pdf'}
                onClick={() => void download('pdf')}
              >
                <Download size={16} />
                Download PDF
              </Button>
              <div className="supplement-exports">
                <Button
                  loading={downloading === 'xlsx'}
                  onClick={async () => {
                    setDownloading('xlsx');
                    await act(
                      () => exportSupplement(task, 'xlsx'),
                      'Excel register downloaded',
                    );
                    setDownloading('');
                  }}
                >
                  Excel register
                </Button>
                <Button
                  loading={downloading === 'pptx'}
                  onClick={async () => {
                    setDownloading('pptx');
                    await act(
                      () => exportSupplement(task, 'pptx'),
                      'Review deck downloaded',
                    );
                    setDownloading('');
                  }}
                >
                  PowerPoint
                </Button>
              </div>
            </div>
          </div>
          <div className="before-after">
            <section>
              <SectionHeading label="01 / ORIGINAL SCANNED REPORT" />
              <DocumentViewer document={document} />
            </section>
            <div className="processing-arrow">
              <ArrowRight size={25} />
              <span>
                AI
                <br />
                PROCESSING
              </span>
            </div>
            <section>
              <SectionHeading label="02 / GENERATED PROFESSIONAL DOCUMENT" />
              <div className="generated-output">
                <PaperReport generated />
              </div>
            </section>
          </div>
          <div className="result-metadata panel">
            <span>
              <b>MODEL</b>
              {data.models.find((m) => m.id === task.modelId)?.name}
            </span>
            <span>
              <b>PROCESSING TIME</b>
              {task.duration} seconds
            </span>
            <span>
              <b>AUDIT REFERENCE</b>
              <Link to={`/workspace/audit?task=${task.id}`}>
                {task.id}
                <ArrowUpRight size={12} />
              </Link>
            </span>
            <span>
              <b>CLASSIFICATION</b>Synthetic / for review
            </span>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
