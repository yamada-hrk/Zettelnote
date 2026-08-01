// ============================================================
// preload スクリプト
// - contextBridge 経由で、レンダラーに安全な API のみを公開する
// - レンダラー側からは window.api.* として利用できる
// ============================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /** メモ一覧(メタ情報のみ)を取得 */
  listNotes: () => ipcRenderer.invoke('notes:list'),

  /** メモを1件取得 */
  getNote: (id) => ipcRenderer.invoke('notes:get', id),

  /** 新規メモを作成し、作成されたメモを返す */
  createNote: () => ipcRenderer.invoke('notes:create'),

  /** メモを更新(patch = { title, body }) */
  updateNote: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),

  /** メモを削除 */
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),

  /**
   * 編集中テキストに対するレコメンド検索
   * @param {{ excludeId: number|null, text: string }} payload
   * @returns {{ vector: RecommendItem[], keyword: RecommendItem[] }}
   */
  recommend: (payload) => ipcRenderer.invoke('notes:recommend', payload),

  // ---- サーバー同期(Step2) ----

  /** 同期ステータスを取得 */
  syncGetStatus: () => ipcRenderer.invoke('sync:get-status'),

  /** 保存済みの暗号化キーを取得(ログイン中のみ。設定画面のプリフィル用) */
  syncGetPassphrase: () => ipcRenderer.invoke('sync:get-passphrase'),

  /** 同期を設定(payload = { serverUrl, token, passphrase }) */
  syncConfigure: (payload) => ipcRenderer.invoke('sync:configure', payload),

  /** 今すぐ同期 */
  syncNow: () => ipcRenderer.invoke('sync:now'),

  /** 同期設定を解除(ローカルのメモは残る) */
  syncDisable: () => ipcRenderer.invoke('sync:disable'),

  /**
   * 同期ステータス変化の購読
   * @param {(status: object) => void} callback
   * @returns {() => void} 購読解除関数
   */
  onSyncStatus: (callback) => {
    const listener = (_e, status) => callback(status);
    ipcRenderer.on('sync:status', listener);
    return () => ipcRenderer.removeListener('sync:status', listener);
  },
});
