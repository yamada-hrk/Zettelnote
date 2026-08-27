// ============================================================
// 関連メモツリー表示(フェーズ4: レイアウト最適化)
//
// tmp/関連メモツリー表示の導入提案.md 参照。編集中のメモを中心に、
// 意味的類似度の高いメモを放射状に配置して表示する全画面オーバーレイ。
//
// フェーズ4のスコープ(3.6):
// - 新規ノード配置時の角度補正: 横断リンク(フェーズ3)は階層展開が
//   完了しないと分からないため、設計時に想定していた「配置と同時に
//   補正する」ことはできない。代わりに、横断リンクが判明した時点で
//   1回だけ、各ノードの角度を横断リンク先の平均角度へ軽く(30%)
//   寄せる後処理として適用する(circularBlend参照)
// - 既存ノード位置の固定+新規ノードのみアニメーション: ノードの角度は
//   上記の1回限りの補正以外では変化しない。新規ノード出現時のフェード
//   イン、および補正時の位置移動は、どちらもTreeNodeButtonの
//   CSSトランジションで滑らかにする
// - 曲線描画: 直線ではなく緩いベジェ曲線(SVG Q)で線を引く。
//   d属性はcalc()を解釈できないため、コンテナの実ピクセルサイズを
//   ResizeObserverで測定し、絶対座標で描画している
//
// ゴーストノード(フェーズ5)・ノードクリックの再センタリング
// (フェーズ6)・拡大縮小(フェーズ8)は未実装
//
// 接続ルールの閾値について: 自前の閾値ロジックは実装していない。
// mpnetの vectorSearch (electron/embeddingCatalog.js) が既に
// z-scoreベースの相対閾値フィルタを持っており、そのままの結果を
// 「閾値通過後の候補」として扱う(フェーズ1で確認済み、3.4参照)
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { vectorSearch } from '../lib/search';
import type { Note } from '../types';

/** 階層ごとの半径(px) */
const RADIUS_STEP = 190;
/** 階層ごとの最大接続数(3.4: 階層が深くなるほど減らす) */
const MAX_PER_DEPTH = [5, 3, 2];
/** 展開する最大階層数 */
const MAX_DEPTH = MAX_PER_DEPTH.length;
/** 表示ノード総数の安全弁(3.4) */
const NODE_CAP = 30;
/** 階層2以降、親ノードの角度を中心に子ノードを扇状に広げる範囲(ラジアン) */
const CHILD_ARC = Math.PI * 0.5;
/** 横断リンクによる角度補正の強さ(0=補正無し、1=完全に平均角度へ) */
const ANGLE_CORRECTION_PULL = 0.3;

interface TreeNode {
  uid: string;
  title: string;
  score: number;
  depth: number;
  angle: number;
  parentUid: string;
}

interface CrossLink {
  a: string;
  b: string;
  score: number;
}

/** 親子関係(発見経路)のペアを正規化したキーで管理する(横断リンクと重複させないため) */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Props {
  notes: Note[];
  centerUid: string;
  modelId: string;
  onOpen: (uid: string) => void;
  onClose: () => void;
}

/** 親の角度を基準に、子ノードの角度を算出する */
function childAngle(
  parentAngle: number | null,
  index: number,
  siblingCount: number,
): number {
  if (parentAngle === null) {
    // 階層1: 全周に均等配置
    return (2 * Math.PI * index) / Math.max(siblingCount, 1) - Math.PI / 2;
  }
  if (siblingCount <= 1) return parentAngle;
  const half = CHILD_ARC / 2;
  return parentAngle - half + (CHILD_ARC * index) / (siblingCount - 1);
}

function polarToXY(radius: number, angle: number): { x: number; y: number } {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * 元の角度を、複数の隣接角度の平均へ pull の強さで寄せる。
 * 単位ベクトルの平均を経由することで、0/2πをまたぐ場合でも破綻しない
 * (例: 0.1radと6.2radの単純平均は誤って約3.15radになってしまうが、
 * 単位ベクトル経由なら正しく0付近になる)
 */
function circularBlend(original: number, neighborAngles: number[], pull: number): number {
  if (neighborAngles.length === 0) return original;
  let sx = 0;
  let sy = 0;
  for (const a of neighborAngles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const avgAngle = Math.atan2(sy, sx);
  const ox = Math.cos(original);
  const oy = Math.sin(original);
  const ax = Math.cos(avgAngle);
  const ay = Math.sin(avgAngle);
  const bx = ox * (1 - pull) + ax * pull;
  const by = oy * (1 - pull) + ay * pull;
  return Math.atan2(by, bx);
}

/** P1→P2を結ぶ緩いベジェ曲線のpath d属性を作る */
function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const offset = Math.min(len * 0.18, 50);
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/**
 * ノード1件分のボタン。マウント時にフェードイン、位置(left/top)が
 * 変化した際(角度補正)は滑らかに移動するよう、CSSトランジションで
 * 制御する
 */
function TreeNodeButton({
  x,
  y,
  width,
  opacity,
  onClick,
  children,
}: {
  x: number;
  y: number;
  width: number;
  opacity: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <button
      onClick={onClick}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        opacity: mounted ? opacity : 0,
        transition: 'opacity 300ms ease-out, left 400ms ease-out, top 400ms ease-out',
      }}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl ring-1 ring-white/10 bg-[#12151f]/90 px-3 py-2 text-left shadow-xl shadow-black/40 backdrop-blur-xl hover:scale-[1.04] hover:ring-indigo-400/40"
    >
      {children}
    </button>
  );
}

export default function NoteTreeView({
  notes,
  centerUid,
  modelId,
  onOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [expanding, setExpanding] = useState(true);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [crossLinks, setCrossLinks] = useState<CrossLink[]>([]);
  const center = notes.find((n) => n.uid === centerUid) ?? null;

  // 曲線描画にはcalc()の効かない絶対px座標が要るため、描画エリアの
  // 実サイズをResizeObserverで測定する
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const update = () => setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setExpanding(true);
    setNodes([]);
    setCrossLinks([]);

    (async () => {
      const seen = new Set<string>([center.uid]);
      const allNodes: TreeNode[] = [];
      // 階層1は中心ノードのみを親に持つ。角度はnullを渡して全周配置にする
      let currentLevel: { uid: string; title: string; body: string; angle: number | null }[] = [
        { uid: center.uid, title: center.title, body: center.body, angle: null },
      ];

      for (let depth = 1; depth <= MAX_DEPTH; depth++) {
        if (cancelled) return;
        if (allNodes.length >= NODE_CAP) break;
        const maxPerNode = MAX_PER_DEPTH[depth - 1];
        const nextLevel: typeof currentLevel = [];

        // 親ノードを順番に処理する(並列にすると同じ階層内での重複排除の
        // 判定が非決定的になるため、あえて直列にしている)
        for (const parent of currentLevel) {
          if (cancelled) return;
          if (allNodes.length >= NODE_CAP) break;

          const candidates = notes.filter((n) => !seen.has(n.uid));
          if (candidates.length === 0) continue;
          const docs = candidates.map((n) => ({ id: n.uid, title: n.title, body: n.body }));
          const results = await vectorSearch(
            `${parent.title}\n${parent.body}`,
            docs,
            maxPerNode,
            modelId,
          );
          if (cancelled) return;

          const siblingCount = results.length;
          results.forEach((item, i) => {
            if (seen.has(item.uid)) return; // 直列処理なので通常起きないが念のため
            if (allNodes.length >= NODE_CAP) return;
            seen.add(item.uid);
            const angle = childAngle(parent.angle, i, siblingCount);
            const node: TreeNode = {
              uid: item.uid,
              title: item.title,
              score: item.score,
              depth,
              angle,
              parentUid: parent.uid,
            };
            allNodes.push(node);
            nextLevel.push({
              uid: item.uid,
              title: item.title,
              body: notes.find((n) => n.uid === item.uid)?.body ?? '',
              angle,
            });
          });
          // 親ノード1件処理するたびに反映(段階的展開)
          setNodes([...allNodes]);
        }

        currentLevel = nextLevel;
        if (currentLevel.length === 0) break; // これ以上広がる先が無い
      }

      if (!cancelled) setExpanding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [center, notes, modelId]);

  // 横断リンク(3.5): 階層展開が完了した後、表示済み全ノード間の
  // ペア比較を行う。既存のvectorSearchを「そのノードをクエリ、他の
  // 表示済みノードをdocs」として呼び出す形で流用しているため、
  // 新しい埋め込み計算ロジックは追加していない
  useEffect(() => {
    if (expanding || !center) return;
    if (nodes.length === 0) return;
    let cancelled = false;

    (async () => {
      const visible = [
        { uid: center.uid, title: center.title, body: center.body },
        ...nodes.map((n) => {
          const note = notes.find((x) => x.uid === n.uid);
          return { uid: n.uid, title: n.title, body: note?.body ?? '' };
        }),
      ];
      // バックボーン(親子関係)は既にメインの線で描画済みなので横断リンクから除外する
      const backbone = new Set(nodes.map((n) => pairKey(n.uid, n.parentUid)));

      const perNodeResults = await Promise.all(
        visible.map(async (n) => {
          const others = visible.filter((o) => o.uid !== n.uid);
          if (others.length === 0) return [];
          const docs = others.map((o) => ({ id: o.uid, title: o.title, body: o.body }));
          const results = await vectorSearch(`${n.title}\n${n.body}`, docs, others.length, modelId);
          return results.map((r) => ({ a: n.uid, b: r.uid, score: r.score }));
        }),
      );
      if (cancelled) return;

      const linkMap = new Map<string, CrossLink>();
      for (const results of perNodeResults) {
        for (const link of results) {
          const key = pairKey(link.a, link.b);
          if (backbone.has(key)) continue;
          const existing = linkMap.get(key);
          if (!existing || existing.score < link.score) {
            linkMap.set(key, { a: link.a, b: link.b, score: link.score });
          }
        }
      }
      setCrossLinks([...linkMap.values()]);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanding, center, modelId]);

  // Escape キーでも閉じられるようにする
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // 角度補正(3.6): 横断リンクが判明した時点で1回だけ、各ノードの角度を
  // 横断リンク先(親を除く)の平均角度へ軽く寄せる。階層(半径)は変えない
  const adjustedAngleByUid = useMemo(() => {
    const map = new Map<string, number>();
    if (crossLinks.length === 0) return map;
    const angleByUid = new Map(nodes.map((n) => [n.uid, n.angle]));
    for (const node of nodes) {
      const neighborAngles: number[] = [];
      for (const link of crossLinks) {
        const otherUid = link.a === node.uid ? link.b : link.b === node.uid ? link.a : null;
        if (!otherUid || otherUid === node.parentUid) continue;
        const a = angleByUid.get(otherUid);
        if (a != null) neighborAngles.push(a);
      }
      if (neighborAngles.length > 0) {
        map.set(node.uid, circularBlend(node.angle, neighborAngles, ANGLE_CORRECTION_PULL));
      }
    }
    return map;
  }, [nodes, crossLinks]);

  if (!center) return null;

  const handleNodeClick = (uid: string) => {
    onOpen(uid);
    onClose();
  };

  // uid → 中心からの相対座標(px)
  const relPosByUid = new Map<string, { x: number; y: number }>([[center.uid, { x: 0, y: 0 }]]);
  for (const node of nodes) {
    const angle = adjustedAngleByUid.get(node.uid) ?? node.angle;
    relPosByUid.set(node.uid, polarToXY(RADIUS_STEP * node.depth, angle));
  }

  // 描画エリアの中心を原点とした絶対座標(曲線描画にはこちらを使う)
  const cx = areaSize.w / 2;
  const cy = areaSize.h / 2;
  const absPosByUid = new Map(
    [...relPosByUid.entries()].map(([uid, p]) => [uid, { x: cx + p.x, y: cy + p.y }]),
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0d14]">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-200">
          {t('noteTree.title')}
          {expanding && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {t('noteTree.expanding')}
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
        >
          ✕ {t('noteTree.close')}
        </button>
      </div>

      <div ref={areaRef} className="relative flex-1 overflow-hidden">
        {nodes.length === 0 && expanding && (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-slate-500">
            {t('noteTree.loading')}
          </p>
        )}

        {areaSize.w > 0 && (
          <>
            {/* 横断リンク(3.5): メインの線より下のレイヤーに、細く・薄く曲線で描画する */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {crossLinks.map((link) => {
                const posA = absPosByUid.get(link.a);
                const posB = absPosByUid.get(link.b);
                if (!posA || !posB) return null;
                return (
                  <path
                    key={`${link.a}|${link.b}`}
                    d={curvedPath(posA.x, posA.y, posB.x, posB.y)}
                    fill="none"
                    stroke="rgba(196, 181, 253, 0.18)"
                    strokeWidth={1}
                  />
                );
              })}
            </svg>

            {/* つながりの線(各ノード → 親ノード。横断リンクより上のレイヤーで、太く・はっきり曲線で描画する) */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {nodes.map((node) => {
                const pos = absPosByUid.get(node.uid)!;
                const parentPos = absPosByUid.get(node.parentUid) ?? { x: cx, y: cy };
                return (
                  <path
                    key={node.uid}
                    d={curvedPath(parentPos.x, parentPos.y, pos.x, pos.y)}
                    fill="none"
                    stroke="rgba(165, 180, 252, 0.35)"
                    strokeWidth={2}
                  />
                );
              })}
            </svg>
          </>
        )}

        {/* 中心ノード */}
        <button
          onClick={() => handleNodeClick(center.uid)}
          className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl ring-1 ring-indigo-400/30 bg-[#12151f]/95 px-4 py-3 text-left shadow-2xl shadow-indigo-950/50 backdrop-blur-xl transition-transform duration-200 hover:scale-[1.03]"
        >
          <div className="truncate text-sm font-semibold text-indigo-300">
            {center.title || t('common.untitled')}
          </div>
        </button>

        {/* 子ノード(意味的類似度上位N件、階層ごとに縮小) */}
        {nodes.map((node) => {
          const pos = absPosByUid.get(node.uid) ?? { x: cx, y: cy };
          // 階層が深いほど少し小さく・淡くする(参考程度のつながりであることを示す)
          const scale = node.depth === 1 ? 1 : node.depth === 2 ? 0.9 : 0.8;
          return (
            <TreeNodeButton
              key={node.uid}
              x={pos.x}
              y={pos.y}
              width={11 * 16 * scale}
              opacity={node.depth === 1 ? 1 : node.depth === 2 ? 0.9 : 0.75}
              onClick={() => handleNodeClick(node.uid)}
            >
              <div className="truncate text-xs font-medium text-slate-200">
                {node.title || t('common.untitled')}
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                {Math.round(node.score * 100)}%
              </div>
            </TreeNodeButton>
          );
        })}
      </div>
    </div>
  );
}
