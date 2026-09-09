import { useState, type SubmitEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  ArrowRight,
  LockKeyhole,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Brand, Button, ErrorMessage } from '../components/common';
import Core from '../components/Core';
export default function Login() {
  const { user, login } = useApp();
  const [email, setEmail] = useState('operator@omnitrix.local');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  if (user)
    return (
      <Navigate to={user.role === 'admin' ? '/admin' : '/workspace'} replace />
    );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      void navigate(u.role === 'admin' ? '/admin' : '/workspace', {
        replace: true,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <Brand />
        <div className="login-editorial">
          <span className="eyebrow orange">
            INTELLIGENCE, WITHIN YOUR BOUNDARIES.
          </span>
          <h1>
            Your intelligence.
            <br />
            Your infrastructure.
            <br />
            <span>Your control.</span>
          </h1>
          <p>
            A sovereign AI workbench for the work
            <br />
            that must stay inside.
          </p>
          <Core large />
        </div>
        <div className="login-trust">
          <ShieldCheck size={17} />
          SELF-HOSTED <i />
          LOCAL INFERENCE
          <i />
          AUDIT-LOGGED
        </div>
      </section>
      <section className="login-form-area">
        <div className="login-top mono">
          OMNITRIX / AUTHENTICATED ACCESS <LockKeyhole size={15} />
        </div>
        <form onSubmit={submit} className="login-form">
          <span className="eyebrow orange">SECURE ACCESS / 01</span>
          <h2>
            Welcome to the <br />
            workbench.
          </h2>
          <p>Sign in with your organizational credentials.</p>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <div className="password-input">
              <input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {error && <ErrorMessage message={error} />}
          <Button
            primary
            loading={busy}
            type="submit"
            className="sign-in-button"
          >
            {busy ? 'Verifying credentials…' : 'Sign in securely'}
            <ArrowRight size={17} />
          </Button>
          <div className="demo-credentials">
            <span className="eyebrow">LOCAL DEMO ACCOUNTS</span>
            <p>
              <b>Operator</b>
              <code>operator@omnitrix.local</code>
            </p>
            <p>
              <b>Administrator</b>
              <code>admin@omnitrix.local</code>
            </p>
            <p className="demo-password">
              Password for both: <code>Omnitrix@2026</code>
            </p>
            <small>Your account determines access automatically.</small>
          </div>
        </form>
        <p className="login-bottom">
          <ShieldCheck size={14} />
          Mock environment · synthetic operational data
        </p>
      </section>
    </main>
  );
}
