// ============================================================
// サーバー同期パネル(左サイドバー下部)
//
// ■ ハイブリッド設計(ローカルファースト)
//   既定は「ローカルモード」: ログイン不要で全機能が使え、
//   サーバーとは一切通信しない。クラウド同期を使いたいユーザーだけが
//   このパネルからアカウントでログイン(オプトイン)する。
//
// - 同期ステータスの常時表示(ローカルモード / 同期中 / 同期済み / エラー)
// - ⚙ ボタンで設定モーダル(ログイン / 新規登録の切替式)
//   * パスワード     … サーバー認証用(アカウント)
//   * 暗号化キー     … メモの暗号化用。この端末の外へ送信されない
// ============================================================
import { useEffect, useState } from 'react';
import type { SyncStatus } from '../types';

export default function SyncPanel() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [open, setOpen] = useState(false);

  // ステータスの初期取得 + メインプロセスからのプッシュ通知を購読
  useEffect(() => {
    void window.api.syncGetStatus().then(setStatus);
    return window.api.onSyncStatus(setStatus);
  }, []);

  const { dot, label } = describe(status);

  return (
    <div className="border-t border-white/5 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* 状態インジケーター */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
          {label}
        </span>

        {/* 今すぐ同期(ログイン済みのときのみ) */}
        {status?.configured && (
          <button
            onClick={() => void window.api.syncNow()}
            title="今すぐ同期"
            className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            ⟳
          </button>
        )}

        {/* 設定モーダルを開く */}
        <button
          onClick={() => setOpen(true)}
          title="クラウド同期の設定"
          className="rounded px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          ⚙
        </button>
      </div>

      {open && (
        <SyncSettingsModal status={status} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

/** ステータス → インジケーターの色とラベル */
function describe(status: SyncStatus | null): { dot: string; label: string } {
  if (!status || !status.configured) {
    return { dot: 'bg-slate-600', label: 'ローカルモード(同期オフ)' };
  }
  const who = status.account ? ` @${status.account}` : '';
  if (status.syncing) {
    return {
      dot: 'bg-indigo-400 animate-pulse shadow-[0_0_6px] shadow-indigo-400/60',
      label: `同期中…${who}`,
    };
  }
  if (status.lastError) {
    return { dot: 'bg-red-400', label: `エラー: ${status.lastError}` };
  }
  if (status.lastSyncAt) {
    const time = new Date(status.lastSyncAt).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { dot: 'bg-emerald-400', label: `同期済み ${time}${who}` };
  }
  return { dot: 'bg-slate-500', label: `同期待機中${who}` };
}

// ------------------------------------------------------------
// 秘密情報の入力欄(既定は非表示・目のアイコンで表示切替)
// ------------------------------------------------------------
function SecretInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? '非表示にする' : '表示する'}
        aria-label={visible ? '入力内容を非表示にする' : '入力内容を表示する'}
        // tabIndex=-1: Tab 移動で入力欄間の行き来を妨げない
        tabIndex={-1}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// 同期設定モーダル(ログイン / 新規登録)
// ------------------------------------------------------------
function SyncSettingsModal({
  status,
  onClose,
}: {
  status: SyncStatus | null;
  onClose: () => void;
}) {
  const [register, setRegister] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    status?.serverUrl || 'http://localhost:8787'
  );
  const [username, setUsername] = useState(status?.account || '');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ログイン中は保存済みの暗号化キー(safeStorage で保護)をプリフィルする
  useEffect(() => {
    if (!status?.configured) return;
    void window.api.syncGetPassphrase().then((saved) => {
      // ユーザーが既に入力を始めていたら上書きしない
      if (saved) setPassphrase((cur) => cur || saved);
    });
  }, [status?.configured]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await window.api.syncConfigure({
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
      passphrase,
      register,
    });
    setBusy(false);
    if (res.ok) {
      onClose();
    } else {
      setError(res.error ?? '設定に失敗しました');
    }
  };

  const disable = async () => {
    if (!window.confirm('同期を解除してローカルモードに戻しますか?(ローカルのメモは残ります)'))
      return;
    await window.api.syncDisable();
    onClose();
  };

  const inputCls =
    'w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200 ring-1 ring-white/10 outline-none transition-shadow placeholder:text-slate-600 focus:ring-indigo-400/50';
  const labelCls = 'mb-1 block text-[11px] font-medium text-slate-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[26rem] rounded-2xl border border-white/10 bg-[#12151f]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <h3 className="text-sm font-bold text-slate-200">☁️ クラウド同期(オプション)</h3>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          設定しなくてもアプリはローカルのみで全機能が使えます。
          同期を有効にすると、メモは
          <span className="text-slate-300">この端末で暗号化してから</span>
          サーバーへ送信されます(ゼロ知識暗号化)。
        </p>

        {/* ログイン / 新規登録の切り替え */}
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

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className={labelCls}>サーバー URL</span>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:8787"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>アカウント名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="英数字 3〜32文字"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>
              パスワード
              <span className="ml-1 text-slate-600">(サーバー認証用・8文字以上)</span>
            </span>
            <SecretInput
              value={password}
              onChange={setPassword}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>
              暗号化キー
              <span className="ml-1 text-slate-600">(パスワードとは別。端末の外に出ません)</span>
            </span>
            <SecretInput
              value={passphrase}
              onChange={setPassphrase}
              placeholder="忘れるとサーバー上のデータは復元できません"
              className={inputCls}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] leading-relaxed text-red-400 ring-1 ring-red-500/20">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={busy}
            className="rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/10 transition-all duration-200 enabled:hover:from-indigo-400 enabled:hover:to-indigo-500 enabled:active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? '接続中…' : register ? '登録して同期を開始' : 'ログインして同期を開始'}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            キャンセル
          </button>
          <div className="flex-1" />
          {status?.configured && (
            <button
              onClick={() => void disable()}
              className="rounded-xl px-3 py-2 text-xs text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              同期を解除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
