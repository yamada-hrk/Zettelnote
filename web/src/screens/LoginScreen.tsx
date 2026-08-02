// ============================================================
// ログイン / 新規登録画面(Web版)
// デスクトップ版 SyncPanel の設定モーダルと同じ役割・同じ視覚言語
// ============================================================
import { useState } from 'react';
import { api, ApiError } from '../lib/apiClient';
import SecretInput from '../components/SecretInput';

export interface Auth {
  token: string;
  username: string;
}

export default function LoginScreen({
  onAuthed,
}: {
  onAuthed: (auth: Auth) => void;
}) {
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const auth = register
        ? await api.register(username.trim(), password)
        : await api.login(username.trim(), password);
      onAuthed(auth);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'サーバーに接続できません');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 outline-none transition-shadow placeholder:text-slate-600 focus:ring-indigo-400/50';

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12151f]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <h1 className="text-lg font-bold text-slate-200">
          🗂️{' '}
          <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
            ZettelNote
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Web版はサーバーへのログインが必須です(常時同期のシンクライアント)。
        </p>

        <div className="mt-4 flex rounded-xl bg-white/5 p-0.5 text-xs font-medium">
          <button
            onClick={() => setRegister(false)}
            className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
              !register
                ? 'bg-white/10 text-indigo-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => setRegister(true)}
            className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
              register
                ? 'bg-white/10 text-indigo-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            新規登録
          </button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">
              アカウント名
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="英数字 3〜32文字"
              className={inputCls}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">
              パスワード
            </span>
            <SecretInput value={password} onChange={setPassword} className={inputCls} />
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 enabled:hover:from-indigo-400 enabled:hover:to-indigo-500 enabled:active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? '処理中…' : register ? '登録する' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
