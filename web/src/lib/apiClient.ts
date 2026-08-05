// ============================================================
// 同期サーバー API クライアント(fetch ベース)
//
// electron/sync.js の request()/api() と同じ役割を、ブラウザの
// fetch で実装したもの。エンドポイントの形は server/index.js と
// 完全に同じ(register/login/meta/notes)なので、デスクトップ版の
// サーバーをそのまま Web版からも利用できる。
// ============================================================

export class ApiError extends Error {}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404) return null as T;
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(detail?.error || `サーバーエラー (HTTP ${res.status})`);
  }
  return res.json();
}

export interface AuthResult {
  token: string;
  username: string;
}

export const api = {
  register: (username: string, password: string) =>
    request<AuthResult>('POST', '/auth/register', { username, password }),

  login: (username: string, password: string) =>
    request<AuthResult>('POST', '/auth/login', { username, password }),

  getMeta: (token: string) =>
    request<{ salt: string; keyCheck: string } | null>('GET', '/meta', undefined, token),

  putMeta: (token: string, salt: string, keyCheck: string) =>
    request<{ salt: string; keyCheck: string }>('PUT', '/meta', { salt, keyCheck }, token),

  getNotes: (token: string, since: number) =>
    request<{
      serverNow: number;
      notes: {
        uid: string;
        payload: string | null;
        iv: string | null;
        updatedAt: number;
        deleted: boolean;
      }[];
    }>('GET', `/notes?since=${since}`, undefined, token),

  putNotes: (
    token: string,
    notes: {
      uid: string;
      iv: string | null;
      payload: string | null;
      updatedAt: number;
      deleted: boolean;
    }[]
  ) => request<{ serverNow: number; applied: number }>('PUT', '/notes', { notes }, token),

  // ---- 意味的類似のベクトルキャッシュ(4.2) ----
  getNoteVectors: (token: string, since: number) =>
    request<{
      serverNow: number;
      vectors: { uid: string; payload: string; iv: string; updatedAt: number }[];
    }>('GET', `/note-vectors?since=${since}`, undefined, token),

  putNoteVectors: (
    token: string,
    vectors: { uid: string; iv: string; payload: string; updatedAt: number }[]
  ) =>
    request<{ serverNow: number; applied: number }>(
      'PUT',
      '/note-vectors',
      { vectors },
      token
    ),

  // ---- アカウント単位のモデル選択(4.4) ----
  getActiveModel: (token: string) =>
    request<{ payload: string; iv: string; updatedAt: number } | null>(
      'GET',
      '/active-model',
      undefined,
      token
    ),

  putActiveModel: (token: string, payload: string, iv: string, updatedAt: number) =>
    request<{ payload: string; iv: string; updatedAt: number }>(
      'PUT',
      '/active-model',
      { payload, iv, updatedAt },
      token
    ),
};
