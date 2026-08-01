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
});
