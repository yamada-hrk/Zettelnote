// ============================================================
// 関連メモツリー表示(フェーズ1: 基盤)
//
// tmp/関連メモツリー表示の導入提案.md 参照。編集中のメモを中心に、
// 意味的類似度の高いメモを放射状に配置して表示する全画面オーバーレイ。
//
// フェーズ1のスコープ: 中心+1階層のみ(多階層展開はフェーズ2)。
// ノードクリックの挙動も暫定でシンプルにしている(再センタリング/
// 中心クリックで開くの使い分けはフェーズ6で対応)
// ============================================================
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { vectorSearch } from '../lib/search';
import type { Note, RecommendItem } from '../types';

/** 中心からの半径(px)。フェーズ1は1階層のみなので固定値 */
const RADIUS = 220;
/** 表示する子ノードの最大数(3.4の階層1の値) */
const MAX_CHILDREN = 5;

interface Props {
  notes: Note[];
  centerUid: string;
  modelId: string;
  onOpen: (uid: string) => void;
  onClose: () => void;
}

export default function NoteTreeView({
  notes,
  centerUid,
  modelId,
  onOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState<RecommendItem[]>([]);
  const center = notes.find((n) => n.uid === centerUid) ?? null;

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setLoading(true);
    const docs = notes
      .filter((n) => n.uid !== center.uid)
      .map((n) => ({ id: n.uid, title: n.title, body: n.body }));
    vectorSearch(`${center.title}\n${center.body}`, docs, MAX_CHILDREN, modelId).then(
      (results) => {
        if (cancelled) return;
        setChildren(results);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [center, notes, modelId]);

  // Escape キーでも閉じられるようにする
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!center) return null;

  const handleNodeClick = (uid: string) => {
    onOpen(uid);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d14]">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-200">{t('noteTree.title')}</h2>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          ✕ {t('noteTree.close')}
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-slate-500">
            {t('noteTree.loading')}
          </p>
        )}

        {/* つながりの線(中心 → 各子ノード) */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {children.map((item, i) => {
            const angle = (2 * Math.PI * i) / Math.max(children.length, 1) - Math.PI / 2;
            const x = Math.cos(angle) * RADIUS;
            const y = Math.sin(angle) * RADIUS;
            return (
              <line
                key={item.uid}
                x1="50%"
                y1="50%"
                x2={`calc(50% + ${x}px)`}
                y2={`calc(50% + ${y}px)`}
                stroke="rgba(165, 180, 252, 0.4)"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {/* 中心ノード */}
        <button
          onClick={() => handleNodeClick(center.uid)}
          className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl ring-1 ring-indigo-400/30 bg-[#12151f]/95 px-4 py-3 text-left shadow-2xl shadow-indigo-950/50 backdrop-blur-xl transition-transform duration-200 hover:scale-[1.03]"
        >
          <div className="truncate text-sm font-semibold text-indigo-300">
            {center.title || t('common.untitled')}
          </div>
        </button>

        {/* 子ノード(意味的類似度上位N件) */}
        {children.map((item, i) => {
          const angle = (2 * Math.PI * i) / Math.max(children.length, 1) - Math.PI / 2;
          const x = Math.cos(angle) * RADIUS;
          const y = Math.sin(angle) * RADIUS;
          return (
            <button
              key={item.uid}
              onClick={() => handleNodeClick(item.uid)}
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
              }}
              className="absolute w-44 -translate-x-1/2 -translate-y-1/2 rounded-xl ring-1 ring-white/10 bg-[#12151f]/90 px-3 py-2 text-left shadow-xl shadow-black/40 backdrop-blur-xl transition-transform duration-200 hover:scale-[1.04] hover:ring-indigo-400/40"
            >
              <div className="truncate text-xs font-medium text-slate-200">
                {item.title || t('common.untitled')}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                {Math.round(item.score * 100)}%
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
