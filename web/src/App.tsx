// ============================================================
// アプリのルート(Web版)
// 状態遷移: 未ログイン → ログイン済み(キー未解除) → 利用可能
//
// 暗号化キーは既定では保持しないが、UnlockScreen で
// 「このブラウザに保存する」を選ぶと IndexedDB(非extractable
// CryptoKey)に保存され、次回以降はアンロック画面を経由せず
// 自動的に利用可能になる(詳細は仕様書 §11 参照)
// ============================================================
import { useEffect, useState } from 'react';
import LoginScreen, { type Auth } from './screens/LoginScreen';
import UnlockScreen from './screens/UnlockScreen';
import NotesApp from './NotesApp';
import { clearKey, loadKey } from './lib/keyStore';

const AUTH_KEY = 'zettelnote:auth';

function loadAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(loadAuth);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  // 保存済みキーの確認が終わるまでは何も描画しない(未確認のまま
  // 一瞬アンロック画面がちらつくのを防ぐ)
  const [checkingSavedKey, setCheckingSavedKey] = useState(!!auth);

  // ログイン済みなら、保存済みの暗号化キーが無いか確認する
  useEffect(() => {
    if (!auth) {
      setCheckingSavedKey(false);
      return;
    }
    let cancelled = false;
    setCheckingSavedKey(true);
    void loadKey(auth.username).then((key) => {
      if (!cancelled) {
        if (key) setCryptoKey(key);
        setCheckingSavedKey(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleAuthed = (a: Auth) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    setAuth(a);
  };

  const handleLogout = () => {
    if (auth) void clearKey(auth.username); // ログアウト時は保存済みキーも必ず削除する
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setCryptoKey(null);
  };

  /** アカウントは維持したまま、保存済みキーだけ削除して再入力を求める */
  const handleForgetKey = () => {
    if (auth) void clearKey(auth.username);
    setCryptoKey(null);
  };

  if (!auth) return <LoginScreen onAuthed={handleAuthed} />;
  if (checkingSavedKey) return null;
  if (!cryptoKey) {
    return (
      <UnlockScreen
        token={auth.token}
        username={auth.username}
        onUnlocked={setCryptoKey}
        onLogout={handleLogout}
      />
    );
  }
  return (
    <NotesApp
      token={auth.token}
      username={auth.username}
      cryptoKey={cryptoKey}
      onLogout={handleLogout}
      onForgetKey={handleForgetKey}
    />
  );
}
