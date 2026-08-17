// ============================================================
// ローカルモード(未ログイン)のNotesApp配線
//
// useLocalNotesStore・useLocalModelSwitch(いずれもサーバー通信を行わない)
// をここで呼び出し、結果をNotesApp本体へpropsとして渡す。
// AuthenticatedApp.tsx と対になる薄い層
// ============================================================
import { useLocalNotesStore } from './lib/localNotesStore';
import { useLocalModelSwitch } from './lib/localModelSwitch';
import NotesApp from './NotesApp';

export default function LocalModeApp({
  onRequestLogin,
}: {
  onRequestLogin: () => void;
}) {
  const { notes, loading, error, save, remove, create } = useLocalNotesStore();
  const {
    activeModelId,
    switching: modelSwitching,
    progress: modelSwitchProgress,
    etaMs: modelSwitchEtaMs,
    switchTo: switchModel,
  } = useLocalModelSwitch(notes);

  return (
    <NotesApp
      mode="local"
      username={null}
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
      onRequestLogin={onRequestLogin}
    />
  );
}
