// ============================================================
// 暗号化キー入力画面(Web版)
//
// アカウントへのログイン(パスワード)とは別に、メモを復号するための
// 暗号化キー(パスフレーズ)をここで入力する。パスフレーズは
// ブラウザに保存しない(desktop版の safeStorage に相当する安全な
// 保存手段がブラウザには無いため、毎セッション入力を求める設計)。
//
// electron/sync.js の configure() と同じロジック:
//   1. サーバーの鍵導出メタ(salt/keyCheck)を取得
//   2. 未初期化(このアカウントで初めての同期)なら salt を新規発行
//   3. 入力されたパスフレーズで鍵を導出し、keyCheck で正誤を検証
// ============================================================
import { useState } from 'react';
import { api, ApiError } from '../lib/apiClient';
import { deriveKey, generateSalt, makeKeyCheck, verifyKeyCheck } from '../lib/webCrypto';

export default function UnlockScreen({
  token,
  username,
  onUnlocked,
  onLogout,
}: {
  token: string;
  username: string;
  onUnlocked: (key: CryptoKey) => void;
  onLogout: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      let meta = await api.getMeta(token);
      if (!meta) {
        const salt = generateSalt();
        const key = await deriveKey(passphrase, salt);
        const keyCheck = await makeKeyCheck(key);
        // PUT は初期化済みなら既存を返す(競合しても安全)
        meta = await api.putMeta(token, salt, keyCheck);
      }
      const key = await deriveKey(passphrase, meta.salt);
      if (!(await verifyKeyCheck(key, meta.keyCheck))) {
        throw new ApiError('暗号化キーが一致しません(このアカウントの既存データと異なるキーです)');
      }
      onUnlocked(key);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'サーバーに接続できません');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12151f]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <h1 className="text-sm font-bold text-slate-200">🔐 暗号化キーの入力</h1>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          @{username} としてログイン中。メモを復号するための暗号化キーを入力してください。
          このキーはブラウザに保存されません(セッションごとに再入力が必要です)。
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="暗号化キー(パスフレーズ)"
            autoFocus
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 outline-none transition-shadow placeholder:text-slate-600 focus:ring-indigo-400/50"
          />

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/20">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !passphrase}
            className="w-full rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 enabled:hover:from-indigo-400 enabled:hover:to-indigo-500 enabled:active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? '確認中…' : '解除する'}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl px-4 py-2 text-xs text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
