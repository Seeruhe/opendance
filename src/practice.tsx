import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, Pause, Play, TimerReset, Volume2, VolumeX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Cues, Player } from './player';
import type { Study } from './store';
import { stepDuration, type Mode, type Move, type Session } from './types';

export function Setup({ name, moveIds, study, initialBpm = 90 }: {
  name: string; moveIds: string[]; study: Study; initialBpm?: number;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('beats');
  const [bpm, setBpm] = useState(initialBpm);
  const [beats, setBeats] = useState(8);
  const [seconds, setSeconds] = useState(30);
  const amount = mode === 'beats' ? beats : seconds;

  if (study.session) return <Link className="button primary" to="/practice"><Play size={16} />继续练习</Link>;

  return <form className="setup" onSubmit={event => {
    event.preventDefault();
    study.start(name, moveIds, mode, bpm, amount);
    navigate('/practice');
  }}>
    <div className="segmented" aria-label="练习模式">
      <button type="button" aria-pressed={mode === 'beats'} onClick={() => setMode('beats')}>按拍数</button>
      <button type="button" aria-pressed={mode === 'time'} onClick={() => setMode('time')}>按时长</button>
    </div>
    <div className="setup-fields">
      {mode === 'beats'
        ? <><label>每个动作拍数<input required type="number" min="1" max="128" value={beats || ''} onChange={event => setBeats(event.target.valueAsNumber)} /></label>
          <label>速度 (BPM)<input required type="number" min="40" max="200" value={bpm || ''} onChange={event => setBpm(event.target.valueAsNumber)} /></label></>
        : <label>每个动作秒数<input required type="number" min="5" max="600" value={seconds || ''} onChange={event => setSeconds(event.target.valueAsNumber)} /></label>}
    </div>
    <button className="button primary" type="submit" disabled={!moveIds.length || !study.ready}><Play size={16} fill="currentColor" />开始练习</button>
  </form>;
}

export function PracticePage({ study, moves }: { study: Study; moves: Map<string, Move> }) {
  const session = study.session;
  if (!session) return <section className="empty panel"><Clock3 /><h1>暂无进行中的练习</h1><Link to="/" className="button primary">去动作库</Link></section>;
  return <ActivePractice key={session.id} study={study} session={session} moves={moves} />;
}

function ActivePractice({ study, session, moves }: { study: Study; session: Session; moves: Map<string, Move> }) {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const triedAutomaticSave = useRef(false);
  const [sound, setSound] = useState(false);
  const deadline = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const current = useRef(session);
  current.current = session;
  const actions = useRef({ save: study.saveSession });
  actions.current = { save: study.saveSession };
  const pulse = useRef(-1);
  const soundOn = useRef(sound);
  soundOn.current = sound;

  function tickSound(beat: number) {
    if (!soundOn.current || !audio.current || pulse.current === beat) return;
    pulse.current = beat;
    const ctx = audio.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = beat % 8 === 1 ? 960 : 700;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.065);
  }

  useEffect(() => {
    if (!running) return;
    const clock = window.setInterval(() => {
      const step = current.current;
      const remainingMs = Math.max(0, deadline.current - performance.now());
      if (remainingMs === 0) {
        setRunning(false);
        const nextIndex = step.index + 1;
        actions.current.save(nextIndex >= step.moveIds.length
          ? { ...step, remainingMs: 0, ended: true }
          : { ...step, index: nextIndex, remainingMs: stepDuration(step.mode, step.amount, step.bpm) });
      } else {
        if (step.mode === 'beats') tickSound(step.amount - Math.ceil(remainingMs / (60_000 / step.bpm)) + 1);
        actions.current.save({ ...step, remainingMs });
      }
    }, 115);
    return () => window.clearInterval(clock);
  }, [running]);

  useEffect(() => () => { if (audio.current) void audio.current.close(); }, []);

  function toggle() {
    if (running) {
      study.saveSession({ ...session, remainingMs: Math.max(1, deadline.current - performance.now()) });
      setRunning(false);
    } else {
      deadline.current = performance.now() + session.remainingMs;
      pulse.current = -1;
      setRunning(true);
    }
  }

  async function toggleSound() {
    if (sound) return setSound(false);
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSound(true);
    } catch {
      setError('当前浏览器无法播放节拍提示。');
    }
  }

  async function finish() {
    setSaving(true);
    setError('');
    try {
      await study.finish(session);
      navigate('/history', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试。');
      setSaving(false);
    }
  }

  useEffect(() => {
    if (session.ended && !triedAutomaticSave.current) {
      triedAutomaticSave.current = true;
      void finish();
    }
  }, [session.ended]);

  if (session.ended) return <section className="panel empty complete">
    <span className="done-icon"><Check /></span><h1>练习完成</h1>
    <p>{session.name} · {session.moveIds.length} 个动作</p>
    {error && <p role="alert">{error}</p>}
    {saving ? <p role="status">正在保存练习…</p> : error && <button className="button primary" onClick={finish}>重试保存</button>}
  </section>;

  const move = moves.get(session.moveIds[session.index]);
  const total = stepDuration(session.mode, session.amount, session.bpm);
  const count = Math.max(1, Math.ceil(session.remainingMs / (session.mode === 'beats' ? 60_000 / session.bpm : 1_000)));
  return <>
    <Link to="/plans" className="back"><ArrowLeft size={17} />练习计划</Link>
    <div className="page-title"><h1>{session.name}</h1><p>第 {session.index + 1} 个动作 · 共 {session.moveIds.length} 个</p></div>
    <div className="detail-grid">
      <div>{move && <Player key={move.id} move={move} compact />}{move && <Cues move={move} />}</div>
      <section className="panel practice-controller">
        <h2>{move?.name ?? '练习计时'}</h2>
        <div className="counter">{session.mode === 'beats' ? session.amount - count + 1 : count}<span>{session.mode === 'beats' ? ' / ' + session.amount + ' 拍' : ' 秒'}</span></div>
        <progress aria-label="练习进度" value={total - session.remainingMs} max={total} />
        <div className="button-row">
          <button className="button primary" onClick={toggle}>{running ? <Pause size={18} /> : <Play size={18} />}{running ? '暂停计时' : '开始计时'}</button>
          <button className="button subtle" aria-label="重置计时" onClick={() => {
            setRunning(false); study.saveSession({ ...session, remainingMs: total });
          }}><TimerReset size={18} /></button>
          {session.mode === 'beats' && <button className="button subtle" aria-label="节拍声音" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>}
        </div>
        {session.index < session.moveIds.length - 1 && <p>下一步：{moves.get(session.moveIds[session.index + 1])?.name}</p>}
        {error && <p role="alert">{error}</p>}
        <button className="text-button" onClick={() => {
          if (window.confirm('结束这次练习？当前进度将清除。')) { setRunning(false); study.saveSession(null); navigate('/plans'); }
        }}>结束本次练习</button>
      </section>
    </div>
  </>;
}
