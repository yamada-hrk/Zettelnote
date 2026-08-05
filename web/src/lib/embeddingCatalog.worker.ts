// ============================================================
// 意味的類似(ベクトル検索)の計算をメインスレッドから切り離すWorker
//
// フェーズ1時点ではモデルカタログ(electron/embeddingCatalog.js)に
// バイグラムTF-IDFしか登録されていないため、このWorkerを挟んでも
// 計算内容は従来と同一。将来ここへ重い埋め込みモデルが追加されても、
// 呼び出し側(web/src/lib/search.ts)のインターフェースは変わらない
// (意味的類似_埋め込みモデル導入提案.md 4.3)
//
// tsconfig側は DOM lib を使っており WebWorker lib と共存できないため、
// self を Worker型へキャストして型を得ている(webworker lib参照は
// プロジェクト全体のDOM libと衝突するため避けている)
// ============================================================
import * as catalogImpl from '../../../electron/embeddingCatalog.js';

interface Doc {
  id: string;
  title: string;
  body: string;
}

interface RequestMessage {
  requestId: number;
  modelId: string;
  query: string;
  docs: Doc[];
  topK: number;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<RequestMessage>) => {
  const { requestId, modelId, query, docs, topK } = e.data;
  const entry = (catalogImpl as any).getCatalogEntry(modelId);
  const result = entry.vectorSearch(query, docs, topK);
  ctx.postMessage({ requestId, result });
};
