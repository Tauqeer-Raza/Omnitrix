import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Terminal,
  Play,
  Check,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { taskApi } from '../api/tasks';
import { Button, PageHeader, StatusBadge, Empty } from '../components/common';
import SovereigntyConsole from '../components/SovereigntyConsole';
import CodeEditor, { SAMPLE_CODE } from '../components/CodeEditor';
import AgentTimeline from '../components/AgentTimeline';
export default function CodeWorkspace() {
  const { id } = useParams();
  const { data, act } = useApp();
  const task = data?.tasks.find((t) => t.id === id);
  const [code, setCode] = useState(SAMPLE_CODE);
  const [execution, setExecution] = useState<
    'idle' | 'running' | 'passed' | 'failed'
  >('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    if (execution !== 'running') return;
    const timer = setTimeout(() => {
      const valid =
        code.includes('def pressure_drop') && code.includes('diameter <= 0');
      setExecution(valid ? 'passed' : 'failed');
      setError(
        valid
          ? ''
          : 'Sample validation failed: the expected function or diameter guard is missing.',
      );
    }, 1600);
    return () => clearTimeout(timer);
  }, [execution, code]);
  if (!task) return <Empty message="This coding task is unavailable." />;
  const failed = execution === 'failed' || task.status === 'failed';
  const passed =
    execution === 'passed' ||
    (task.status === 'completed' && execution === 'idle');
  return (
    <>
      <Link
        className="breadcrumb-back"
        to={`/workspace/chats/${task.conversationId ?? task.id}`}
      >
        <ArrowLeft size={13} />
        Back to conversation / <span className="mono">{task.id}</span>
      </Link>
      <PageHeader
        eyebrow="SANDBOXED CODE WORKFLOW"
        title={task.title}
        description="Generate, inspect and validate code inside your local boundary."
        action={<StatusBadge status={task.status} />}
      />
      <div className="code-workflow">
        <aside className="code-request panel">
          <div className="section-title">TASK REQUEST</div>
          <p>{task.prompt}</p>
          <div className="note">
            <ShieldCheck size={15} />
            Local example · no Python is executed in this browser.
          </div>
          <hr className="thin-divider" />
          <div className="section-title">AGENT ACTIVITY</div>
          <AgentTimeline task={task} />
          {task.status === 'failed' && (
            <Button
              onClick={() =>
                void act(() => taskApi.retry(task.id), 'Task restarted')
              }
            >
              <RotateCcw size={14} />
              Retry workflow
            </Button>
          )}
        </aside>
        <section className="code-center">
          <CodeEditor code={code} onChange={setCode} />
          <div className="execution-console">
            <div className="execution-heading">
              <Terminal size={16} />
              <span>EXECUTION CONSOLE</span>
              <span className="badge-outline">SIMULATED</span>
              <Button
                loading={execution === 'running'}
                disabled={task.status === 'running' || task.status === 'queued'}
                onClick={() => {
                  setError('');
                  setExecution('running');
                }}
              >
                <Play size={13} />
                {execution === 'failed'
                  ? 'Retry sample checks'
                  : 'Run sample checks'}
              </Button>
            </div>
            <div className="execution-lines">
              <p>
                <span>●</span>SANDBOX{' '}
                {task.step >= 4 || passed ? 'STARTED' : 'WAITING'}{' '}
                <small>network: disabled · filesystem: isolated</small>
              </p>
              {(passed || execution === 'running' || failed) && (
                <p>
                  <Check size={13} />
                  CODE PREPARED <small>Python source generated</small>
                </p>
              )}
              {execution === 'running' ? (
                <p className="orange">→ CHECKING SAMPLE STRUCTURE…</p>
              ) : failed ? (
                <>
                  <p className="execution-error">
                    <AlertTriangle size={13} />
                    EXECUTION FAILED
                  </p>
                  <pre>{error || task.error}</pre>
                  <p>exit code: 1 · sandbox: STOPPED</p>
                </>
              ) : passed ? (
                <>
                  <p>
                    <Check size={13} />
                    TEST 1 PASSED <small>synthetic nominal-case result</small>
                  </p>
                  <p>
                    <Check size={13} />
                    TEST 2 PASSED{' '}
                    <small>synthetic input-validation result</small>
                  </p>
                  <div className="code-result">
                    <span>OUTPUT / SAMPLE</span>
                    <b>Pressure drop: 15,979.23 Pa</b>
                    <p>Pressure drop: 0.1598 bar</p>
                  </div>
                  <p className="execution-note">
                    Demo checks inspect the expected sample structure. Download
                    both files to run the Python unit tests locally.
                  </p>
                </>
              ) : (
                <p className="execution-note">
                  Execution events will appear as the workflow progresses.
                </p>
              )}
            </div>
          </div>
        </section>
        {['running', 'queued'].includes(task.status) && (
          <SovereigntyConsole task={task} />
        )}
      </div>
    </>
  );
}
