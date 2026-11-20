import { useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, LogOut, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type Study } from './store';
import type { Account } from './types';

type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export function AccountPage({ study }: { study: Study }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get('invite') ?? '');
  const [register, setRegister] = useState(Boolean(code));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (!window.PublicKeyCredential) throw new Error('请在支持 Passkey 的浏览器中通过 HTTPS 或 localhost 打开。');
      const flow = register ? 'register' : 'login';
      const path = '/auth/' + flow;
      const credential = register
        ? await startRegistration({ optionsJSON: await api<RegistrationOptions>(path + '/options', 'POST', { name, code: code.trim() }) })
        : await startAuthentication({ optionsJSON: await api<AuthenticationOptions>(path + '/options', 'POST') });
      const { account } = await api<{ account: Account }>(path + '/verify', 'POST', credential);
      await study.switchAccount(account);
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败，请重试。';
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Passkey 操作已取消或超时。' : message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/auth/logout', 'POST');
      await study.switchAccount(null);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : '退出失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel account-panel">
    <span className="account-symbol"><UserRound /></span>
    <h1>{study.account ? study.account.name : register ? '接受邀请' : '登录 OpenDance'}</h1>
    <p>{study.account ? '收藏、计划和练习记录会同步到这个账号。' : '使用 Passkey 同步收藏、计划和练习记录。'}</p>
    {error && <p className="alert" role="alert">{error}</p>}
    {study.account
      ? <button className="button subtle" disabled={busy} onClick={logout}><LogOut size={18} />退出登录</button>
      : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        {register && <>
          <label>昵称<input autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} maxLength={40} required /></label>
          <label>邀请码<input value={code} onChange={event => setCode(event.target.value)} required /></label>
        </>}
        <button className="button primary" type="submit" disabled={!study.ready || busy}><Fingerprint size={19} />{busy ? '等待设备确认…' : register ? '创建 Passkey' : '用 Passkey 登录'}</button>
        <button className="text-button" type="button" onClick={() => { setRegister(!register); setError(''); }}>
          {register ? '已有账号？登录' : '我有邀请码'}
        </button>
      </form>}
  </section>;
}
