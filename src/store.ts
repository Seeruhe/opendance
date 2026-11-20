import { useEffect, useState } from 'react';
import { stepDuration, type Account, type Plan, type Practice, type Session, type StudyState, type Mode } from './types';

const empty = (): StudyState => ({ favorites: [], plans: [], history: [] });
const guestKey = 'opendance:guest';

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '暂时无法连接，请重试。');
  return result;
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function useStudy() {
  const [account, setAccount] = useState<Account | null>(null);
  const [state, setState] = useState(() => readLocal(guestKey, empty()));
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');

  const sessionKey = 'opendance:practice:' + (account?.id ?? 'guest');

  async function switchAccount(next: Account | null) {
    const nextState = next ? await api<StudyState>('/me/state') : readLocal(guestKey, empty());
    setAccount(next);
    setState(nextState);
    setSession(readLocal('opendance:practice:' + (next?.id ?? 'guest'), null));
    setAuthError('');
  }

  async function load() {
    setReady(false);
    try {
      const { account: current } = await api<{ account: Account | null }>('/auth/me');
      await switchAccount(current);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '无法载入账号。');
      setSession(readLocal('opendance:practice:guest', null));
    } finally {
      setReady(true);
    }
  }

  useEffect(() => { void load(); }, []);

  function update(change: (current: StudyState) => StudyState) {
    setState(current => change(current));
  }

  useEffect(() => {
    if (ready && !account) {
      try { localStorage.setItem(guestKey, JSON.stringify(state)); } catch { /* Current tab still works. */ }
    }
  }, [ready, account, state]);

  async function favorite(id: string) {
    const saved = !state.favorites.includes(id);
    if (account) await api('/me/favorites/' + id, 'PUT', { saved });
    update(current => ({
      ...current, favorites: saved ? [...new Set([...current.favorites, id])] : current.favorites.filter(move => move !== id),
    }));
  }

  async function savePlan(plan: Plan) {
    if (account) plan = await api<Plan>('/me/plans/' + plan.id, 'PUT', plan);
    update(current => ({ ...current, plans: [plan, ...current.plans.filter(item => item.id !== plan.id)] }));
  }

  async function deletePlan(id: string) {
    if (account) await api('/me/plans/' + id, 'DELETE');
    update(current => ({ ...current, plans: current.plans.filter(plan => plan.id !== id) }));
  }

  function saveSession(value: Session | null) {
    try {
      if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
      else localStorage.removeItem(sessionKey);
    } catch { /* Practice stays available in the current tab. */ }
    setSession(value);
  }

  function start(name: string, moveIds: string[], mode: Mode, bpm: number, amount: number) {
    saveSession({
      id: crypto.randomUUID(), name, moveIds, mode, bpm, amount,
      index: 0, remainingMs: stepDuration(mode, amount, bpm), ended: false,
    });
  }

  async function finish(current: Session) {
    const { id, name, moveIds, mode, bpm, amount } = current;
    let record: Practice = {
      id, name, moveIds, mode, bpm, amount,
      elapsedSeconds: Math.max(1, Math.round(stepDuration(mode, amount, bpm) * moveIds.length / 1000)),
      completedAt: new Date().toISOString(),
    };
    if (account) record = await api<Practice>('/me/practice/' + id, 'PUT', record);
    update(previous => ({ ...previous, history: [record, ...previous.history.filter(item => item.id !== id)] }));
    saveSession(null);
  }

  return {
    account, state, ready, authError, session, switchAccount, load,
    favorite, savePlan, deletePlan, saveSession, start, finish,
  };
}

export type Study = ReturnType<typeof useStudy>;
