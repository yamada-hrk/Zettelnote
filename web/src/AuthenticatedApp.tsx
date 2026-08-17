// ============================================================
// アカウント同期モード(ログイン済み)のNotesApp配線
//
// useNotesStore・useVectorSync・useModelSwitch(いずれもサーバー同期を伴う)
// をここで呼び出し、結果をNotesApp本体へpropsとして渡す。NotesApp自体は
// account/localどちらのモードかを意識せずに済むようにするための薄い層
// (LocalModeApp.tsx と対になる)
// ============================================================
import { useNotesStore } from './lib/notesStore';
import { useVectorSync } from './lib/vectorSync';
import { useModelSwitch } from './lib/modelSwitch';
import NotesApp from './NotesApp';

export default function AuthenticatedApp({
  token,
  username,
  cryptoKey,
  onLogout,
  onForgetKey,
}: {
  token: string;
  username: string;
  cryptoKey: CryptoKey;
  onLogout: () => void;
  onForgetKey: () => void;
}) {
  const { notes, loading, error, save, remove, create } = useNotesStore(
    token,
    cryptoKey,
  );
  // 意味的類似のベクトル・モデル選択はメモ本文とは別サイクルで同期する(4.2)
  const { pullVectors } = useVectorSync(token, cryptoKey);
  const {
    activeModelId,
    switching: modelSwitching,
    progress: modelSwitchProgress,
    etaMs: modelSwitchEtaMs,
    switchTo: switchModel,
  } = useModelSwitch(token, cryptoKey, notes, pullVectors);

  return (
    <NotesApp
      mode="account"
      username={username}
      notes={notes}
      loading={loading}
      error={error}
      save={save}
      remove={remove}
      create={create}
      activeModelId={activeModelId}
      modelSwitching={modelSwitching}
      modelSwitchProgress={modelSwitchProgress}
      modelSwitchEtaMs={modelSwitchEtaMs}
      switchModel={switchModel}
      onLogout={onLogout}
      onForgetKey={onForgetKey}
    />
  );
}
