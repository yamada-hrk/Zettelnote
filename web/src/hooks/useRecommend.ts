// ============================================================
// 関連メモ算出フック(意味的類似 / キーワード)
//
// RecommendPanel(デスクトップのサイドバー)と MobileRecommendStrip
// (スマホの編集/プレビュー画面下部の帯パネル)の両方で使う検索ロジックを
// ここに共通化している。electron/search.js の vectorSearch/keywordSearch
// をそのまま共有しているため判定結果は完全に同一。
// ============================================================
import { useEffect, useState } from 'react';
import { vectorSearch, keywordSearch, extractTags, DEFAULT_MODEL_ID } from '../lib/search';
import type { RecommendItem } from '../types';

export type RecommendMode = 'vector' | 'keyword';

export function useRecommend(
  queryText: string,
  excludeUid: string | null,
  docs: { uid: string; title: string; body: string }[],
  modelId: string = DEFAULT_MODEL_ID,
) {
  const [mode, setMode] = useState<RecommendMode>('vector');
  const [results, setResults] = useState<{
    vector: RecommendItem[];
    keyword: RecommendItem[];
  }>({
    vector: [],
    keyword: [],
  });

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
    // ベクトル検索の結果には無いため、ここで両モード共通に付与している。
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

    // キーワード検索は同期のまま即座に反映
    setResults((prev) => ({
      ...prev,
      keyword: withSharedTags(keywordSearch(text, targets, 10)),
    }));

    // 意味的類似はWorker経由の非同期呼び出し(4.3)。応答が返る前に
    // queryText 等が変わった場合は古いリクエストの結果を捨てる
    // (新しい結果を後から来た古い応答で上書きしないためのガード)
    let cancelled = false;
    vectorSearch(text, targets, 10, modelId).then((vectorResults) => {
      if (cancelled) return;
      setResults((prev) => ({
        ...prev,
        vector: withSharedTags(vectorResults),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [queryText, excludeUid, docs, modelId]);

  return {
    mode,
    setMode,
    items: mode === 'vector' ? results.vector : results.keyword,
  };
}
