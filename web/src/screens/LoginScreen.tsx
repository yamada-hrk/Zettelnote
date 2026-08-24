// ============================================================
// ログイン / 新規登録画面(Web版)
// デスクトップ版 SyncPanel の設定モーダルと同じ役割・同じ視覚言語
// ============================================================
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/apiClient';
import SecretInput from '../components/SecretInput';

export interface Auth {
  token: string;
  username: string;
}

export default function LoginScreen({
  onAuthed,
  onBack,
}: {
  onAuthed: (auth: Auth) => void;
  /** ローカルモードから遷移してきた場合、ログインせずに戻る */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
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
      setError(e instanceof ApiError ? e.message : t('login.connectError'));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 outline-none transition-shadow placeholder:text-slate-600 focus:ring-indigo-400/50';

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-8">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
        {/* 製品紹介(ログインフォームだけの「行き止まり」画面にならないよう、
            zettelnote.top のランディングページの要約をここにも置いている) */}
        <div className="px-1">
          <h1 className="text-2xl font-bold text-slate-100 md:text-3xl">
            {t('login.heroTitle1')}
            <br />
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              {t('login.heroTitle2')}
            </span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {t('login.heroLead')}
          </p>
          <ul className="mt-5 space-y-2.5 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span>🔗</span>
              <span>{t('login.feature1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span>✨</span>
              <span>{t('login.feature2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span>🔒</span>
              <span>{t('login.feature3')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span>🔄</span>
              <span>{t('login.feature4')}</span>
            </li>
          </ul>
          <a
            href="https://zettelnote.top/"
            className="mt-5 inline-block text-xs font-medium text-indigo-300 hover:text-indigo-200"
          >
            {t('login.learnMore')}
          </a>
        </div>

        <div className="w-full max-w-sm justify-self-center rounded-2xl border border-white/10 bg-[#12151f]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl md:justify-self-end">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-3 text-xs text-slate-500 hover:text-slate-300"
            >
              {t('login.backToLocalMode')}
            </button>
          )}
          <h2 className="text-lg font-bold text-slate-200">
            🗂️{' '}
            <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
              ZettelNote
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">{t('login.webNotice')}</p>

          <div className="mt-4 flex rounded-xl bg-white/5 p-0.5 text-xs font-medium">
            <button
              onClick={() => setRegister(false)}
              className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
                !register
                  ? 'bg-white/10 text-indigo-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t('login.tabLogin')}
            </button>
            <button
              onClick={() => setRegister(true)}
              className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
                register
                  ? 'bg-white/10 text-indigo-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t('login.tabRegister')}
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
                {t('login.accountName')}
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('login.accountNamePlaceholder')}
                className={inputCls}
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-400">
                {t('login.password')}
              </span>
              <SecretInput
                value={password}
                onChange={setPassword}
                className={inputCls}
              />
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
              {busy
                ? t('login.submitBusy')
                : register
                  ? t('login.submitRegister')
                  : t('login.submitLogin')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
