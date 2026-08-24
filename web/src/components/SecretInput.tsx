// ============================================================
// 秘密情報の入力欄(既定は非表示・目のアイコンで表示切替)
// デスクトップ版 SyncPanel.tsx の SecretInput と同じ挙動
// ============================================================
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function SecretInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? t('secretInput.hide') : t('secretInput.show')}
        aria-label={visible ? t('secretInput.hideAria') : t('secretInput.showAria')}
        // tabIndex=-1: Tab 移動で入力欄間の行き来を妨げない
        tabIndex={-1}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200"
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  );
}
