// ============================================================
// Node(Electronメインプロセス)向けの mpnet 埋め込み関数ファクトリ
//
// electron/embeddingCatalog.js の mpnetVectorSearch は embed 関数を
// 呼び出し側から注入させる設計にしている(Web版WorkerのRolldownビルドが
// CJSファイル内の動的importを解決できないため)。このファイルはNode側
// でのみ require() され、Viteのバンドル対象には含まれない
//
// 現時点(フェーズ2)ではElectron側にモデル選択UIがまだ無く、
// main.js は常にバイグラム(DEFAULT_MODEL_ID)を使うため、この
// ファイルはまだどこからも呼ばれていない。将来アカウント単位の
// モデル選択(4.4)をElectron側にも実装する際に main.js から使う
// ============================================================
let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    const { pipeline } = require('@huggingface/transformers');
    extractorPromise = pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-mpnet-base-v2',
      { dtype: 'q8' },
    );
  }
  return extractorPromise;
}

/** @type {(text: string) => Promise<number[]>} */
async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

module.exports = { embed };
