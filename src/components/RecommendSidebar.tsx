// ============================================================
// 右カラム: リアルタイム・レコメンドサイドバー
//
// ■ タブ切り替え
//   「意味的類似(ベクトル一致)」と「キーワード一致」を切り替え表示(各 Top10)
//
// ■ グラデーションUI(情報量の傾斜)
//   - 1〜3位: カード表示(タイトル + 抜粋3行 + スコアバー)
//   - 4〜6位: コンパクト表示(タイトル + 抜粋1行)
//   - 7位以下: スリム表示(タイトルのみ / ホバーで抜粋がスライド表示)
//   さらに順位が下がるほど透明度を上げ、視覚的な重み付けを行う
//
// ■ マイクロインタラクション
//   - ホバー時に scale(1.03) で滑らかに拡大 + glow-card の輝線ボーダー
//   - 出現時は rise-in で順位に応じたスタッガー(時間差)アニメーション
//   サイドバーに左右パディングを確保してあるため、拡大しても枠を越境しない。
//
// ■ ハッシュタグによる繋がりの可視化
//   編集中メモと共通のタグ(sharedTags)を持つ候補には、バイオレットの
//   「#タグ」チップを表示する(キーワード一致のインディゴチップと色で区別)
//
// ■ キーワードタブの優先度(バックエンドのソートと対応)
//   第1優先: ハッシュタグが一致するメモ / 第2優先: キーワードのみ一致
//   の順で並ぶため、境界に「# タグ一致」「キーワード一致」の小見出しを
//   挿入し、タグ一致カードには薄いバイオレットの枠でさりげなく差をつける
// ============================================================
import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RecommendItem, RecommendMode, RecommendResult } from '../types';

interface Props {
  result: RecommendResult;
  searching: boolean;
  onOpen: (id: number) => void;
}

export default function RecommendSidebar({ result, searching, onOpen }: Props) {
  const [mode, setMode] = useState<RecommendMode>('vector');
  const items = mode === 'vector' ? result.vector : result.keyword;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/5 bg-white/[0.02] backdrop-blur-xl">
      {/* ヘッダー */}
      <div className="border-b border-white/5 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-200">🔗 関連メモ</h2>
          {/* 検索中インジケーター(淡く発光) */}
          {searching && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-400 shadow-[0_0_8px] shadow-indigo-400/60" />
          )}
        </div>

        {/* タブ: ベクトル一致 / 単語一致 */}
        <div className="mt-2.5 flex rounded-xl bg-white/5 p-0.5 text-xs font-medium">
          <TabButton
            active={mode === 'vector'}
            onClick={() => setMode('vector')}
            label="✨ 意味的類似"
          />
          <TabButton
            active={mode === 'keyword'}
            onClick={() => setMode('keyword')}
            label="🔤 キーワード"
          />
        </div>
      </div>

      {/* レコメンド一覧 */}
      <div className="thin-scrollbar flex-1 overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs leading-relaxed text-slate-500">
            {searching
              ? '検索中…'
              : 'メモを書き始めると、ここに関連メモが表示されます。'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, rank) => {
              // キーワードタブ: タグ一致組と一般キーワード組の境界に小見出しを挿入
              // (バックエンドがタグ一致を最優先でソート済みであることが前提)
              const tagMatched = (item.sharedTags?.length ?? 0) > 0;
              const showTagHeader =
                mode === 'keyword' && rank === 0 && tagMatched;
              const showPlainHeader =
                mode === 'keyword' &&
                !tagMatched &&
                rank > 0 &&
                (items[rank - 1].sharedTags?.length ?? 0) > 0;
              return (
                <Fragment key={`${mode}-${item.id}`}>
                  {showTagHeader && (
                    <GroupHeader label="# タグ一致" tone="violet" />
                  )}
                  {showPlainHeader && <GroupHeader label="キーワード一致" />}
                  <RecommendCard
                    item={item}
                    rank={rank}
                    mode={mode}
                    onOpen={onOpen}
                  />
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------
// グループ小見出し(キーワードタブの優先度の区切り)
// ------------------------------------------------------------
function GroupHeader({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'violet' | 'slate';
}) {
  return (
    <li
      className={`flex items-center gap-2 px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider ${
        tone === 'violet' ? 'text-violet-300/80' : 'text-slate-500'
      }`}
    >
      {label}
      <span
        className={`h-px flex-1 ${
          tone === 'violet' ? 'bg-violet-400/20' : 'bg-white/10'
        }`}
      />
    </li>
  );
}

// ------------------------------------------------------------
// タブボタン
// ------------------------------------------------------------
function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-2 py-1.5 transition-all duration-200 ${
        active
          ? 'bg-white/10 text-indigo-300 shadow-sm'
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

// ------------------------------------------------------------
// レコメンド1件分のカード(順位によって情報量を変える)
// ------------------------------------------------------------
function RecommendCard({
  item,
  rank,
  mode,
  onOpen,
}: {
  item: RecommendItem;
  rank: number;
  mode: RecommendMode;
  onOpen: (id: number) => void;
}) {
  // 順位による表示ティア: 0=リッチ / 1=コンパクト / 2=スリム
  const tier = rank < 3 ? 0 : rank < 6 ? 1 : 2;
  // 下位ほど淡く表示する(グラデーション効果)。rise-in の最終透明度として渡す
  const opacity = Math.max(1 - rank * 0.055, 0.55);

  // ホバー時: 3% 拡大 + 輝線ボーダー(glow-card) + 背景をわずかに明るく。
  // サイドバー側の px-3(12px)以内に収まるため枠を越境しない
  const hoverFx =
    'glow-card transition-all duration-200 ease-out hover:scale-[1.03] hover:bg-white/[0.06] hover:shadow-xl hover:shadow-indigo-950/60 hover:z-10';

  // キーワードタブでタグ一致したカードは薄いバイオレットの枠で区別する
  const tagMatched = mode === 'keyword' && (item.sharedTags?.length ?? 0) > 0;
  const tier0Frame = tagMatched
    ? 'bg-violet-500/[0.05] ring-1 ring-violet-400/25'
    : 'bg-white/[0.04] ring-1 ring-white/[0.07]';
  const tier1Frame = tagMatched
    ? 'bg-violet-500/[0.03] ring-1 ring-violet-400/20'
    : 'bg-white/[0.02] ring-1 ring-white/[0.05]';

  // 順位に応じた時間差で下からふわっと出現させる
  const riseStyle: CSSProperties = {
    '--rise-opacity': opacity,
    animationDelay: `${rank * 30}ms`,
  } as CSSProperties;

  return (
    <li style={riseStyle} className="rise-in relative">
      {/* ---- ティア0: リッチカード(抜粋3行 + スコアバー) ---- */}
      {tier === 0 && (
        <button
          onClick={() => onOpen(item.id)}
          className={`group w-full rounded-xl p-3 text-left ${tier0Frame} ${hoverFx}`}
        >
          <div className="flex items-start gap-2">
            <RankBadge rank={rank} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200 transition-colors group-hover:text-indigo-300">
              {item.title}
            </span>
          </div>
          {item.excerpt && (
            <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-500">
              {item.excerpt}
            </p>
          )}
          {/* 編集中メモと共通のタグ(バイオレット) + キーワード一致語(インディゴ) */}
          <SharedTagChips tags={item.sharedTags} />
          {mode === 'keyword' && (
            <MatchedTermChips
              terms={item.matchedTerms}
              sharedTags={item.sharedTags}
            />
          )}
          <ScoreBar score={item.score} />
        </button>
      )}

      {/* ---- ティア1: コンパクト(抜粋1行) ---- */}
      {tier === 1 && (
        <button
          onClick={() => onOpen(item.id)}
          className={`group w-full rounded-xl px-3 py-2 text-left ${tier1Frame} ${hoverFx}`}
        >
          <div className="flex items-center gap-2">
            <RankBadge rank={rank} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-300 transition-colors group-hover:text-indigo-300">
              {item.title}
            </span>
          </div>
          {item.excerpt && (
            <p className="mt-0.5 truncate pl-7 text-[11px] text-slate-500">
              {item.excerpt}
            </p>
          )}
          <SharedTagChips tags={item.sharedTags} small />
        </button>
      )}

      {/* ---- ティア2: スリム(タイトルのみ / ホバーで抜粋を展開) ---- */}
      {tier === 2 && (
        <button
          onClick={() => onOpen(item.id)}
          className={`group w-full rounded-lg px-3 py-1.5 text-left ring-1 ring-transparent ${hoverFx}`}
        >
          <div className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-center text-[10px] text-slate-600">
              {rank + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-400 transition-colors group-hover:text-indigo-300">
              {item.title}
            </span>
            {/* タグの繋がりだけは最小表示でも示す */}
            {item.sharedTags && item.sharedTags.length > 0 && (
              <span
                title={item.sharedTags.map((t) => `#${t}`).join(' ')}
                className="shrink-0 rounded-full bg-violet-500/15 px-1.5 text-[9px] text-violet-300"
              >
                #{item.sharedTags[0]}
                {item.sharedTags.length > 1 && ` +${item.sharedTags.length - 1}`}
              </span>
            )}
          </div>
          {/* ホバー時のみ抜粋がスライド表示されるマイクロインタラクション */}
          {item.excerpt && (
            <p className="max-h-0 overflow-hidden pl-7 text-[11px] leading-relaxed text-slate-500 opacity-0 transition-all duration-300 ease-out group-hover:mt-0.5 group-hover:max-h-16 group-hover:opacity-100">
              {item.excerpt}
            </p>
          )}
        </button>
      )}
    </li>
  );
}

/**
 * 編集中メモと共通のハッシュタグチップ(バイオレット)
 * 「同じタグを持つメモ」であることをひと目で示す
 */
function SharedTagChips({
  tags,
  small = false,
}: {
  tags?: string[];
  small?: boolean;
}) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${small ? 'mt-1 pl-7' : 'mt-1.5'}`}>
      {tags.map((t) => (
        <span
          key={t}
          title="編集中のメモと同じタグ"
          className={`rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/25 ${
            small ? 'px-1.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
          }`}
        >
          #{t}
        </span>
      ))}
    </div>
  );
}

/**
 * キーワード一致語チップ(インディゴ)
 * 共通タグとして表示済みの語は重複表示しない
 */
function MatchedTermChips({
  terms,
  sharedTags,
}: {
  terms?: string[];
  sharedTags?: string[];
}) {
  const rest = (terms || []).filter((t) => !(sharedTags || []).includes(t));
  if (rest.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {rest.map((t) => (
        <span
          key={t}
          className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** 順位バッジ(1〜6位用) */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
        rank === 0
          ? 'bg-gradient-to-br from-indigo-400 to-violet-500 text-white shadow-md shadow-indigo-500/30'
          : rank < 3
            ? 'bg-indigo-500/20 text-indigo-300'
            : 'bg-white/10 text-slate-400'
      }`}
    >
      {rank + 1}
    </span>
  );
}

/** 類似度スコアバー(上位カードのみ表示) */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}
