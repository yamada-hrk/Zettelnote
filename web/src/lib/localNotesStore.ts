// ============================================================
// ローカルモードのメモストア(未ログイン体験)
//
// notesStore.ts の useNotesStore と同じ戻り値の形
// ({ notes, loading, error, save, remove, create }) を持つが、
// サーバーとの通信・暗号化を一切行わない。この端末のIndexedDBに
// のみ保存する(アカウント登録前でもアプリの中核機能に実際に
// 触れられるようにするための「お試し」ではなく、同期不要な
// ユーザーにとっての恒常的な選択肢としても位置づけている)。
//
// zettelnote-cache(ログイン後の復号済みキャッシュ)とは別のIndexedDB名
// にすることで、ログイン後の本物のメモと混同・衝突しないようにしている
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Note } from '../types';

const DB_NAME = 'zettelnote-local-mode';
const STORE_NAME = 'notes';

const sortByUpdatedDesc = (notes: Note[]) =>
  [...notes].sort((a, b) => b.updatedMs - a.updatedMs);

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'uid' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function getAllNotes(): Promise<Note[]> {
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as Note[]) || []);
    req.onerror = () => resolve([]);
  });
}

async function putNote(note: Note): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function deleteNoteFromDb(uid: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** 初回アクセス時(ローカルモード用DBが空の場合)にのみ書き込むサンプルメモ */
function seedNotes(): Note[] {
  const now = Date.now();
  const mk = (offsetMs: number, title: string, body: string): Note => ({
    uid: crypto.randomUUID(),
    title,
    body,
    createdAt: new Date(now - offsetMs).toISOString(),
    updatedMs: now - offsetMs,
  });
  return [
    mk(
      4000,
      'ZettelNoteの使い方',
      'これはローカルモード(この端末にのみ保存される、アカウント登録不要のお試し環境)のサンプルメモです。\n\n左のメモ一覧から他のサンプルも見てみてください。メモを開くたびに、右側(スマホでは画面下部)に関連するメモが自動的に表示されます。試しにこのメモの本文を編集してみると、保存されて一覧の順番が変わるのが分かります。\n\nマルチデバイス同期やクラウドバックアップが必要な場合は、画面右上からアカウント登録できます。\n\n#はじめに #ZettelNote',
    ),
    mk(
      3000,
      'ツェッテルカステンとは',
      'ツェッテルカステン(Zettelkasten、ドイツ語で「メモ箱」の意)は、社会学者ニクラス・ルーマンが実践していたメモ術です。\n\nフォルダやタグでトップダウンに分類するのではなく、メモとメモを「つながり」でボトムアップに結びつけていくことで、後から見返したときに思わぬ発見が生まれます。\n\nZettelNoteはこの考え方を、手作業でリンクを貼らなくても自動的につながりを提示する形でソフトウェア化したものです。\n\n#zettelkasten #メモ術',
    ),
    mk(
      2000,
      'ゼロ知識暗号化の仕組み',
      'アカウント登録して使う場合、入力したメモは送信される前に端末上でAES-256-GCMにより暗号化されます。暗号化キーはあなたが設定するパスフレーズから端末上で導出され、サーバーへ送信されることはありません。\n\nサーバーが保存するのは暗号化済みのデータだけなので、データベースが漏えいしても、パスフレーズを知らない限りメモの中身を読むことはできません。\n\n(このローカルモードのメモは、そもそもサーバーへ一切送信されず、この端末のブラウザ内だけに保存されています)\n\n#セキュリティ #暗号化',
    ),
    mk(
      1000,
      '意味的類似検索について',
      '関連メモの検索には、文字の並びが似ているメモを高速に検出する「バイグラム検索」と、文章の意味そのものをベクトル化して比較する多言語対応の埋め込みモデルの、2種類から選んで使うことができます。\n\n前者はほぼゼロコストで動作し、後者は語彙が異なっていても意味が近いメモを見つけ出せます。左下の「意味的類似のモデル」から切り替えられます。\n\n#検索 #AI',
    ),
    mk(
      0,
      'マルチデバイス同期について',
      'ローカルモードのメモはこの端末・このブラウザにのみ保存されます。ブラウザのデータを消去したり、別の端末やブラウザからアクセスすると、これらのメモは見えません。\n\nスマホとパソコンなど複数端末で同じメモを見たい・自動で同期したい場合は、アカウント登録が必要です。登録は無料です。\n\n#マルチデバイス同期 #はじめに',
    ),
  ];
}

export function useLocalNotesStore() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const indexRef = useRef<Map<string, Note>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let all = await getAllNotes();
      if (!cancelled && all.length === 0) {
        for (const note of seedNotes()) await putNote(note);
        all = await getAllNotes();
      }
      if (cancelled) return;
      indexRef.current = new Map(all.map((n) => [n.uid, n]));
      setNotes(sortByUpdatedDesc(all));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(
    async (uid: string, title: string, body: string, createdAt: string) => {
      const note: Note = { uid, title, body, createdAt, updatedMs: Date.now() };
      await putNote(note);
      indexRef.current.set(uid, note);
      setNotes(sortByUpdatedDesc([...indexRef.current.values()]));
    },
    [],
  );

  const remove = useCallback(async (uid: string) => {
    await deleteNoteFromDb(uid);
    indexRef.current.delete(uid);
    setNotes(sortByUpdatedDesc([...indexRef.current.values()]));
  }, []);

  const create = useCallback(async () => {
    const uid = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await save(uid, '', '', createdAt);
    return uid;
  }, [save]);

  return { notes, loading, error: null as string | null, save, remove, create };
}
