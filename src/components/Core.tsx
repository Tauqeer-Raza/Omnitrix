import { Cpu, Database, Workflow, ShieldCheck, ScanLine } from 'lucide-react';
export default function Core({ large = false }: { large?: boolean }) {
  return (
    <div
      className={`core-diagram ${large ? 'core-large' : ''}`}
      aria-label="Local architecture: models, router, knowledge, agents and audit connected to the Omnitrix core"
      role="img"
    >
      <div className="technical-grid" />
      <div className="core-orbit orbit-one" />
      <div className="core-orbit orbit-two" />
      <div className="core-axis horizontal" />
      <div className="core-axis vertical" />
      <div className="core-object" aria-hidden="true">
        <div className="core-ring ring-back" />
        <div className="core-ring ring-mid" />
        <div className="core-ring ring-front" />
        <div className="core-center">
          <span />
          <span />
          <span />
        </div>
        <div className="core-light" />
      </div>
      <span className="core-label label-model">
        <Cpu size={13} />
        MODEL
      </span>
      <span className="core-label label-router">
        <Workflow size={13} />
        ROUTER
      </span>
      <span className="core-label label-knowledge">
        <Database size={13} />
        KNOWLEDGE
      </span>
      <span className="core-label label-agent">
        <ScanLine size={13} />
        AGENT
      </span>
      <span className="core-label label-audit">
        <ShieldCheck size={13} />
        AUDIT
      </span>
      <span className="core-caption mono">
        FIG. 01 — LOCAL INTELLIGENCE CORE
      </span>
      <span className="core-coordinate mono">
        X 28.41
        <br />Y 06.78
      </span>
    </div>
  );
}
