// ============================================================
// 右カラム: リアルタイム・レコメンド(Web版)
//
// デスクトップ版 RecommendSidebar.tsx の中核ロジック(タブ切替・
// スコアバー・検索クエリ駆動への切替・タグによる繋がりの可視化)を
// 移植したもの。electron/search.js の vectorSearch/keywordSearch を
// そのまま共有しているため、判定アルゴリズムはデスクトップ版と完全に同一
//
// v1 スコープ: デスクトップ版のような順位ごとの情報量グラデーション
// (リッチ/コンパクト/スリムの3段階)やホバー演出は簡略化している
// ============================================================
import { useEffect, useState } from 'react';
import { vectorSearch, keywordSearch, extractTags } from './lib/search';
import type { RecommendItem } from './types';

type Mode = 'vector' | 'keyword';

export default function RecommendPanel({
  width,
  queryText,
  excludeUid,
  docs,
  onOpen,
}: {
  /** パネルの幅。リサイズ対応のため親から渡される(モバイル全画面表示時は '100%') */
  width: number | string;
  /** 連想の基準になるテキスト(編集中メモ、または検索クエリ) */
  queryText: string;
  /** 除外するメモ(編集中メモ自身。検索クエリ駆動時は null) */
  excludeUid: string | null;
  docs: { uid: string; title: string; body: string }[];
  onOpen: (uid: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('vector');
  const [results, setResults] = useState<{
    vector: RecommendItem[];
    keyword: RecommendItem[];
  }>({
    vector: [],
    keyword: [],
  });

  const queryMode = excludeUid === null && queryText.trim().length > 0;

  // vectorSearch/keywordSearch はブラウザのメインスレッドで完結する同期処理
  // (バイグラムTF-IDF)のため、IPC 越しに計算するデスクトップ版と異なり
  // 待機インジケーターは持たない(体感できるほどの遅延が発生しないため)。
  // デバウンスは呼び出し元(NotesApp)の debouncedRecommendText 側で行う
  useEffect(() => {
    const text = queryText.trim();
    if (!text) {
      setResults({ vector: [], keyword: [] });
      return;
    }
    const targets = docs
      .filter((d) => d.uid !== excludeUid)
      .map((d) => ({ id: d.uid, title: d.title, body: d.body }));

    // 編集中メモ(またはクエリ)と各候補メモの共通タグを算出する
    // (キーワード検索はタグ優先ソートのため search.js 内部で算出済みだが、
    // ベクトル検索の結果には無いため、ここで両タブ共通に付与している。
    // デスクトップ版 main.js の withSharedTags() と同じロジック)
    const queryTags = extractTags(text);
    const docTags = new Map(docs.map((d) => [d.uid, extractTags(d.body)]));
    const withSharedTags = (items: RecommendItem[]) =>
      items.map((item) => ({
        ...item,
        sharedTags: queryTags.filter((t) =>
          (docTags.get(item.uid) ?? []).includes(t),
        ),
      }));

    setResults({
      vector: withSharedTags(vectorSearch(text, targets, 10)),
      keyword: withSharedTags(keywordSearch(text, targets, 10)),
    });
  }, [queryText, excludeUid, docs]);

  const items = mode === 'vector' ? results.vector : results.keyword;

  return (
    <aside
      style={{ width }}
      className="flex h-full shrink-0 flex-col bg-white/[0.02]"
    >
      <div className="border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">
            {queryMode ? (
              <>
                ✨{' '}
                <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">
                  「{queryText.trim()}」の連想結果
                </span>
              </>
            ) : (
              '🔗 関連メモ'
            )}
          </h2>
        </div>

        <div className="mt-2.5 flex rounded-xl bg-white/5 p-0.5 text-xs font-medium">
          <button
            onClick={() => setMode('vector')}
            className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
              mode === 'vector'
                ? 'bg-white/10 text-indigo-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            ✨ 意味的類似
          </button>
          <button
            onClick={() => setMode('keyword')}
            className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
              mode === 'keyword'
                ? 'bg-white/10 text-indigo-300 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            🔤 キーワード
          </button>
        </div>
      </div>

      <div className="thin-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-slate-500">
            {queryText.trim()
              ? '関連するメモは見つかりませんでした。'
              : 'メモを書き始めると、ここに関連メモが表示されます。'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, rank) => (
              <li key={item.uid}>
                <button
                  onClick={() => onOpen(item.uid)}
                  className="group w-full rounded-xl bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.07] transition-all duration-200 hover:scale-[1.02] hover:bg-white/[0.06]"
                >
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-400">
                      {rank + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200 group-hover:text-indigo-300">
                      {item.title}
                    </span>
                  </div>
                  {item.excerpt && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {item.excerpt}
                    </p>
                  )}
                  {/* 編集中メモ(またはクエリ)と共通のハッシュタグ(バイオレット) */}
                  {item.sharedTags && item.sharedTags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.sharedTags.map((t) => (
                        <span
                          key={t}
                          title="編集中のメモと同じタグ"
                          className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300 ring-1 ring-violet-400/25"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  {mode === 'keyword' &&
                    // 共通タグとして既に表示済みの語は重複表示しない
                    (item.matchedTerms || []).filter(
                      (t) => !(item.sharedTags || []).includes(t),
                    ).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(item.matchedTerms || [])
                          .filter((t) => !(item.sharedTags || []).includes(t))
                          .map((t) => (
                            <span
                              key={t}
                              className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
                            >
                              {t}
                            </span>
                          ))}
                      </div>
                    )}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400"
                        style={{
                          width: `${Math.round(Math.min(Math.max(item.score, 0), 1) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-slate-500">
                      {Math.round(Math.min(Math.max(item.score, 0), 1) * 100)}%
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
