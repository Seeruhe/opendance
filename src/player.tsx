import { useEffect, useRef, useState } from 'react';
import { FlipHorizontal2, Pause, Play, RotateCcw } from 'lucide-react';
import type { Move } from './types';

export function Player({ move, compact = false }: { move: Move; compact?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const [mirrored, setMirrored] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed, revision]);

  async function toggle() {
    const element = video.current;
    if (!element) return;
    if (element.paused) {
      try { await element.play(); } catch { setFailed(true); }
    } else element.pause();
  }

  if (!move.media) return <div className="media-empty"><span>视频待补充</span><p>可以先按下方的动作提示练习。</p></div>;

  return <div className={compact ? 'player compact-player' : 'player'}>
    <div className="video-stage">
      <video key={revision} ref={video} src={move.media.video} poster={move.media.poster}
        preload="metadata" muted playsInline loop
        className={mirrored ? 'mirrored' : ''}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} />
      {failed
        ? <button className="stage-button" onClick={() => { setFailed(false); setPlaying(false); setRevision(revision + 1); }}>
          <RotateCcw size={20} /> 重试视频</button>
        : !playing && <button className="stage-play" aria-label="播放示范" onClick={toggle}><Play size={25} fill="currentColor" /></button>}
    </div>
    <div className="player-controls">
      <button className="button subtle" onClick={toggle} disabled={failed}>
        {playing ? <Pause size={16} /> : <Play size={16} />}{playing ? '暂停' : '播放'}</button>
      <label className="speed-control">速度
        <select aria-label="播放速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          <option value={1}>1×</option><option value={0.75}>0.75×</option><option value={0.5}>0.5×</option><option value={0.25}>0.25×</option>
        </select>
      </label>
      <button className={'button subtle ' + (mirrored ? 'selected' : '')} aria-pressed={mirrored} onClick={() => setMirrored(!mirrored)}>
        <FlipHorizontal2 size={17} />镜像</button>
    </div>
  </div>;
}

export function Cues({ move }: { move: Move }) {
  return <section className="panel cues">
    <h2>动作提示</h2>
    <ol>{move.cues.map((cue, index) => <li key={cue}><span>{String(index + 1).padStart(2, '0')}</span>{cue}</li>)}</ol>
  </section>;
}
