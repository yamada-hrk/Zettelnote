// ============================================================
// アプリのルート(Web版)
// 状態遷移: 未ログイン → ログイン済み(キー未解除) → 利用可能
// ============================================================
import { useState } from 'react';
import LoginScreen, { type Auth } from './screens/LoginScreen';
import UnlockScreen from './screens/UnlockScreen';
import NotesApp from './NotesApp';

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
  // 暗号化キーは意図的に永続化しない(ブラウザにはOSレベルの安全な
  // 保存手段が無いため、セッションごとに再入力を求める設計)
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);

  const handleAuthed = (a: Auth) => {
    localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    setAuth(a);
  };

  const handleLogout = () => {
    localStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setCryptoKey(null);
  };

  if (!auth) return <LoginScreen onAuthed={handleAuthed} />;
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
    />
  );
}
