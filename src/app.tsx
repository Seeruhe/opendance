import { useEffect, useState } from 'react';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, AudioLines, BookOpen,
  Check, ChevronRight, CircleUserRound, Clock3, Footprints, Heart, History, ListMusic,
  Play, Plus, Search, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AccountPage } from './account';
import { Cues, Player } from './player';
import { PracticePage, Setup } from './practice';
import { api, type Study, useStudy } from './store';
import type { Move, Plan } from './types';

const navigation = [
  { to: '/', label: '动作库', icon: BookOpen },
  { to: '/plans', label: '计划', icon: ListMusic },
  { to: '/history', label: '记录', icon: History },
];

function Brand() {
  return <Link className="brand" to="/"><span className="brand-icon"><Activity size={23} strokeWidth={2.5} /></span>
    <span>Open<span>Dance</span></span></Link>;
}

export function App() {
  const study = useStudy();
  const [moves, setMoves] = useState<Move[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const location = useLocation();
  const lookup = new Map(moves.map(move => [move.id, move]));

  async function loadCatalogue() {
    setLoading(true);
    setCatalogueError('');
    try {
      const result = await api<{ moves: Move[]; styles: string[] }>('/moves');
      setMoves(result.moves);
      setStyles(result.styles);
    } catch {
      setCatalogueError('动作库暂时无法载入。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCatalogue(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return <div className="app">
    <aside className="sidebar">
      <Brand />
      <nav aria-label="主导航">
        {navigation.map(({ to, label, icon: Icon }) => <NavLink end={to === '/'} to={to} key={to}><Icon size={19} /><span>{label}</span></NavLink>)}
      </nav>
      <NavLink className="profile" to="/account"><CircleUserRound size={23} /><span>{study.account?.name ?? '访客'}<small>{study.account ? '已同步' : '账号与同步'}</small></span><ChevronRight size={15} /></NavLink>
    </aside>
    <header className="mobile-header"><Brand /><Link to="/account" aria-label="账号"><CircleUserRound size={25} /></Link></header>
    <main id="main-content">
      {study.authError && <div className="alert">暂时无法加载账号。 <button className="text-button" onClick={() => void study.load()}>重试</button></div>}
      {catalogueError && <div className="alert" role="alert">{catalogueError} <button className="text-button" onClick={() => void loadCatalogue()}>重试</button></div>}
      <Routes>
        <Route path="/" element={<Library moves={moves} styles={styles} study={study} loading={loading} />} />
        <Route path="/moves/:id" element={<MovePage moves={lookup} study={study} pending={loading || Boolean(catalogueError)} />} />
        <Route path="/plans" element={<PlansPage study={study} moves={lookup} />} />
        <Route path="/practice" element={study.ready ? <PracticePage study={study} moves={lookup} /> : <p role="status">正在读取练习…</p>} />
        <Route path="/history" element={<HistoryPage study={study} />} />
        <Route path="/account" element={<AccountPage study={study} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  </div>;
}

const normalize = (text: string) => text.toLowerCase().replace(/[-\s]+/g, '');

function Library({ moves, styles, study, loading }: { moves: Move[]; styles: string[]; study: Study; loading: boolean }) {
  const [term, setTerm] = useState('');
  const [style, setStyle] = useState('');
  const [level, setLevel] = useState('');
  const [onlySaved, setOnlySaved] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const featured = moves.find(move => move.id === 'running-man');
  const filtered = moves.filter(move => (!style || move.style === style) && (!level || move.level === level) &&
    (!onlySaved || study.state.favorites.includes(move.id)) && (!hasVideo || move.media) &&
    [move.name, move.zh, move.focus, move.style].some(value => normalize(value).includes(normalize(term))));

  return <>
    {study.session && <Link to="/practice" className="resume panel"><span><Clock3 size={19} />继续练习 · {study.session.name}</span><ArrowRight size={19} /></Link>}
    <header className="hero">
      <div className="hero-copy">
        <h1>街舞动作库<span>.</span></h1>
        <p>拆开每一步，跟着节拍练。</p>
        {featured && <Link className="button primary" to="/moves/running-man"><Play size={15} fill="currentColor" />跟练 Running Man</Link>}
      </div>
      {featured?.media && <Link to="/moves/running-man" className="hero-visual" aria-label="查看 Running Man">
        <img src={featured.media.poster} alt="" />
        <span className="hero-caption"><AudioLines size={15} />Running Man<ArrowUpRight size={16} /></span>
      </Link>}
    </header>

    <section className="library" aria-labelledby="browse-title">
      <div className="section-heading"><h2 id="browse-title">浏览动作</h2><span>{filtered.length} 个动作</span></div>
      <div className="tool-row">
        <label className="search"><Search size={20} /><input aria-label="搜索动作" placeholder="搜索舞步或舞种" value={term} onChange={event => setTerm(event.target.value)} />
          {term && <button type="button" aria-label="清空搜索" onClick={() => setTerm('')}><X size={16} /></button>}
        </label>
        <label className="filter-control"><SlidersHorizontal size={17} /><select aria-label="难度" value={level} onChange={event => setLevel(event.target.value)}>
          <option value="">全部难度</option><option>入门</option><option>进阶</option>
        </select></label>
        <button className="button subtle filter-toggle" aria-pressed={hasVideo} onClick={() => setHasVideo(!hasVideo)}><Play size={15} />有示范</button>
        <button className="button subtle filter-toggle" aria-pressed={onlySaved} onClick={() => setOnlySaved(!onlySaved)}><Heart size={16} />收藏</button>
      </div>
      <div className="filters" aria-label="舞种">
        {['', ...styles].map(item => <button key={item} type="button" aria-pressed={style === item} onClick={() => setStyle(item)}>{item || '全部舞种'}</button>)}
      </div>
      {loading ? <p role="status">正在载入动作…</p>
        : filtered.length ? <div className="move-grid">{filtered.map(move => <MoveCard key={move.id} move={move} study={study} />)}</div>
        : <section className="empty panel"><Search /><h3>没有匹配的动作</h3><button className="button subtle" onClick={() => {
          setTerm(''); setStyle(''); setLevel(''); setOnlySaved(false); setHasVideo(false);
        }}>清除筛选</button></section>}
    </section>
  </>;
}

function Favorite({ move, study }: { move: Move; study: Study }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = study.state.favorites.includes(move.id);
  return <div className="favorite-wrap">
    <button className="favorite" type="button" aria-label={(saved ? '取消收藏 ' : '收藏 ') + move.name} aria-pressed={saved}
      disabled={busy || !study.ready} onClick={async () => {
        setBusy(true); setError('');
        try { await study.favorite(move.id); }
        catch (err) { setError(err instanceof Error ? err.message : '收藏失败。'); }
        finally { setBusy(false); }
      }}><Heart size={19} fill={saved ? 'currentColor' : 'none'} /></button>
    {error && <span className="mini-alert" role="alert">{error}</span>}
  </div>;
}

function MoveCard({ move, study }: { move: Move; study: Study }) {
  return <article className={move.media ? 'move-card media-card' : 'move-card'}>
    {move.media && <Link to={'/moves/' + move.id} className="card-art" aria-label={'查看 ' + move.name}>
      <img src={move.media.poster} alt="" loading="lazy" /><span className="card-play"><Play size={15} fill="currentColor" />有示范</span>
    </Link>}
    <div className="card-content">
      <Link className="card-main" to={'/moves/' + move.id}>
        <div className="move-meta"><span>{move.style}</span><span>{move.level}</span><span>{move.focus}</span></div>
        <h3>{move.name}</h3><p>{move.zh}</p>
      </Link>
      <Favorite move={move} study={study} />
    </div>
  </article>;
}

function MovePage({ moves, study, pending }: { moves: Map<string, Move>; study: Study; pending: boolean }) {
  const { id } = useParams();
  const move = moves.get(id ?? '');
  if (!move) return pending ? <p role="status">正在载入动作…</p> : <NotFound />;
  return <MoveDetail key={move.id} move={move} study={study} />;
}

function MoveDetail({ move, study }: { move: Move; study: Study }) {
  const [planId, setPlanId] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function add() {
    setBusy(true); setNotice(''); setError('');
    try {
      const plan = study.state.plans.find(item => item.id === planId);
      await study.savePlan(plan
        ? { ...plan, moveIds: [...plan.moveIds, move.id] }
        : { id: crypto.randomUUID(), name: '我的练习', moveIds: [move.id] });
      setNotice('已添加到' + (plan?.name ?? '我的练习'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Link className="back" to="/"><ArrowLeft size={17} />动作库</Link>
    <div className="page-title title-with-action">
      <div><div className="move-meta"><span>{move.style}</span><span>{move.level}</span><span>{move.focus}</span></div>
        <h1>{move.name}</h1><p>{move.zh} · {move.description}</p></div>
      <Favorite move={move} study={study} />
    </div>
    <div className="detail-grid">
      <div>
        <Player move={move} />
        {move.media && <p className="credit"><a href={move.media.source} target="_blank" rel="noreferrer">{move.media.author} / Wikimedia Commons</a>
          {' · '}<a href={move.media.licenseUrl} target="_blank" rel="noreferrer">{move.media.license}</a>{' · '}{move.media.changes}</p>}
        <Cues move={move} />
      </div>
      <div className="detail-side">
        <section className="panel"><h2>单动作练习</h2><Setup name={move.name} moveIds={[move.id]} study={study} /></section>
        <section className="panel"><h2>加入计划</h2>
          <label>选择计划<select value={planId} onChange={event => { setPlanId(event.target.value); setNotice(''); }}>
            <option value="">新建「我的练习」</option>{study.state.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
          </select></label>
          <button type="button" className="button subtle add-button" onClick={add} disabled={busy || !study.ready}><Plus size={18} />添加到计划</button>
          {notice && <p className="inline-success" role="status"><Check size={15} />{notice}</p>}
          {error && <p className="alert" role="alert">{error}</p>}
        </section>
      </div>
    </div>
  </>;
}

function PlansPage({ study, moves }: { study: Study; moves: Map<string, Move> }) {
  const [editing, setEditing] = useState<Plan | null>(null);
  return <>
    <div className="page-title title-with-action"><div><h1>练习计划</h1><p>把几个舞步排成一组，跟着拍子练。</p></div>
      <button className="button primary" disabled={!study.ready} onClick={() => setEditing({ id: crypto.randomUUID(), name: '', moveIds: [] })}><Plus size={18} />新建计划</button>
    </div>
    {!study.ready && <p role="status">正在读取计划…</p>}
    {editing && <PlanEditor key={editing.id} plan={editing} study={study} moves={moves} close={() => setEditing(null)} />}
    {study.ready && !study.state.plans.length && !editing && <section className="empty panel"><ListMusic /><h2>还没有练习计划</h2>
      <p>可以从动作库选择一个舞步加入计划。</p><Link to="/" className="button subtle">浏览动作</Link>
    </section>}
    <div className="plans-grid">{study.state.plans.filter(plan => plan.id !== editing?.id).map(plan => <section className="panel" key={plan.id}>
      <div className="section-heading"><h2>{plan.name}</h2><button className="text-button" onClick={() => setEditing(plan)}>编辑</button></div>
      {plan.moveIds.length ? <ol className="plan-list">{plan.moveIds.map((id, index) =>
        <li key={id + index}><span>{index + 1}</span><Link to={'/moves/' + id}>{moves.get(id)?.name ?? id}</Link></li>)}</ol> : <p>还没有动作。</p>}
      {!!plan.moveIds.length && <Setup name={plan.name} moveIds={plan.moveIds} study={study} />}
    </section>)}</div>
  </>;
}

function PlanEditor({ plan, study, moves, close }: { plan: Plan; study: Study; moves: Map<string, Move>; close: () => void }) {
  const [name, setName] = useState(plan.name);
  const [ids, setIds] = useState(plan.moveIds);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const existing = study.state.plans.some(item => item.id === plan.id);

  function reorder(index: number, next: number) {
    const items = [...ids];
    [items[index], items[next]] = [items[next], items[index]];
    setIds(items);
  }

  async function persist(remove = false) {
    setBusy(true); setError('');
    try {
      if (remove) await study.deletePlan(plan.id);
      else await study.savePlan({ id: plan.id, name: name.trim(), moveIds: ids });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请重试。');
      setBusy(false);
    }
  }

  return <form className="panel plan-editor" onSubmit={event => { event.preventDefault(); if (name.trim()) void persist(); }}>
    <h2>{existing ? '编辑计划' : '新建计划'}</h2>
    <label>计划名称<input required maxLength={60} value={name} onChange={event => setName(event.target.value)} /></label>
    <div className="add-move">
      <label>选择动作<select value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">从动作库选择</option>{[...moves.values()].map(move => <option key={move.id} value={move.id}>{move.name} · {move.zh}</option>)}
      </select></label>
      <button type="button" className="button subtle" disabled={!selected || ids.length >= 60} onClick={() => {
        setIds([...ids, selected]); setSelected('');
      }}><Plus size={17} />加入</button>
    </div>
    <ol className="plan-list">{ids.map((id, index) => <li key={id + index}>
      <span>{index + 1}</span><strong>{moves.get(id)?.name ?? id}</strong>
      <button className="icon-button" type="button" disabled={!index} aria-label="上移" onClick={() => reorder(index, index - 1)}><ArrowUp size={16} /></button>
      <button className="icon-button" type="button" disabled={index === ids.length - 1} aria-label="下移" onClick={() => reorder(index, index + 1)}><ArrowDown size={16} /></button>
      <button className="icon-button" type="button" aria-label="移除动作" onClick={() => setIds(ids.filter((_, item) => item !== index))}><X size={17} /></button>
    </li>)}</ol>
    {error && <p className="alert" role="alert">{error}</p>}
    <div className="button-row"><button className="button primary" disabled={busy || !name.trim()}>保存计划</button>
      <button type="button" className="button subtle" onClick={close} disabled={busy}>取消</button>
      {existing && <button type="button" className="button subtle danger" disabled={busy} onClick={() => {
        if (window.confirm('删除这个练习计划？')) void persist(true);
      }}><Trash2 size={16} />删除</button>}
    </div>
  </form>;
}

function HistoryPage({ study }: { study: Study }) {
  const date = new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium', timeStyle: 'short' });
  return <>
    <div className="page-title"><h1>练习记录</h1><p>{study.account ? '已同步至你的账号。' : '访客记录保存在当前浏览器。'}</p></div>
    {!study.ready ? <p role="status">正在读取记录…</p> : study.state.history.length
      ? <ul className="history-list">{study.state.history.map(item => <li className="panel" key={item.id}>
        <span className="account-symbol"><Check size={20} /></span><div><h2>{item.name}</h2>
          <p>{item.moveIds.length} 个动作 · {item.elapsedSeconds} 秒 · {item.mode === 'beats' ? item.bpm + ' BPM' : '按时长'}</p></div>
        <time dateTime={item.completedAt}>{date.format(new Date(item.completedAt))}</time>
      </li>)}</ul>
      : <section className="panel empty"><Footprints /><h2>还没有练习记录</h2>
        <p>完成第一次练习后，你可以在这里回看。</p><Link className="button subtle" to="/">去动作库</Link>
      </section>}
  </>;
}

function NotFound() {
  const navigate = useNavigate();
  return <section className="empty panel"><Search /><h1>找不到该页面</h1>
    <button className="button primary" onClick={() => navigate('/')}>返回动作库</button></section>;
}
