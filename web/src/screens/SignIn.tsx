import { useState } from 'react';
import { Ink } from '../components/Ink.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Field } from '../components/ui/Field.tsx';
import { Notice, Panel } from '../components/ui/Panel.tsx';
import { useSession } from '../lib/session.tsx';

export function SignIn() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="mb-6 flex items-center gap-3">
        <Ink className="text-ink h-10 w-10" />
        <div>
          <h1 className="text-[20px]">Kung Fu Madness</h1>
          <p className="text-muted text-[12px]">Three attacks, three blocks, one round at a time.</p>
        </div>
      </div>

      <Panel title={mode === 'in' ? 'Sign in' : 'Sign up'}>
        <form onSubmit={submit} className="space-y-3 p-3">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <div className="flex items-center justify-between gap-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </Button>
            <button
              type="button"
              className="text-muted hover:text-ink text-[12px] underline"
              onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
            >
              {mode === 'in' ? 'No account yet?' : 'Already have one?'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
