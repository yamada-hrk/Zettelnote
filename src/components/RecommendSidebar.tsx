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
// ============================================================
import { useState } from 'react';
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
            {items.map((item, rank) => (
              <RecommendCard
                key={`${mode}-${item.id}`}
                item={item}
                rank={rank}
                mode={mode}
                onOpen={onOpen}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
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
          className={`group w-full rounded-xl bg-white/[0.04] p-3 text-left ring-1 ring-white/[0.07] ${hoverFx}`}
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
          {/* キーワード一致タブでは一致語をチップ表示 */}
          {mode === 'keyword' && item.matchedTerms && item.matchedTerms.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.matchedTerms.map((t) => (
                <span
                  key={t}
                  className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <ScoreBar score={item.score} />
        </button>
      )}

      {/* ---- ティア1: コンパクト(抜粋1行) ---- */}
      {tier === 1 && (
        <button
          onClick={() => onOpen(item.id)}
          className={`group w-full rounded-xl bg-white/[0.02] px-3 py-2 text-left ring-1 ring-white/[0.05] ${hoverFx}`}
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
