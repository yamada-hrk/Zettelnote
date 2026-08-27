// ============================================================
// 関連メモツリー表示(フェーズ1〜8実装済み + 横断リンクの段階的計算)
//
// tmp/関連メモツリー表示の導入提案.md 参照。編集中のメモを中心に、
// 意味的類似度の高いメモを放射状に配置して表示する全画面オーバーレイ。
//
// 【体感速度改善】横断リンク(3.5)は当初、階層展開が完全に終わって
// から一括計算していたが、これを「新しいノードが1件追加されるたびに、
// その時点で既に表示中の全ノードとの横断リンクをその場でバックグラウンド
// (fire-and-forget)でチェックする」方式に変更した。階層展開と横断
// リンク計算を同時並行で進められるため、ノードと横断リンクが同時に
// 少しずつ増えていく見た目になる(3.5参照)。
// - 網羅性: 「新しいノードNが追加されたら、既に表示中の全ノードとNの
//   ペアだけをチェックする」ルールにより、どのペアも「後から追加された
//   方」のタイミングで必ず1回チェックされ、重複計算・漏れ無く全ペアを
//   網羅できる
// - 中心ノードだけは例外: 中心は最初から表示されているため、他ノードの
//   ように「後から追加された側のチェック」で自然にはカバーされない。
//   階層展開が完了した後にまとめて1回だけチェックする
// - 角度補正(3.6)はnodes/crossLinksの変化に反応するuseMemoのため、
//   横断リンクが見つかるたびに再計算される。ただし毎回ノードの
//   「元の基本角度」から計算し直す実装のため、再計算を繰り返しても
//   累積誤差でズレていく心配は無い
// - Workerが1つしかないため計算総量・実測時間はほぼ変わらない
//   (体感速度改善が主目的。真の高速化にはWorker複数化が必要、
//   ただしメモリコストが高いため現時点では未採用。3.5・5章参照)
//
// フェーズ8のスコープ(3.9): Google Mapsのような操作感を目指す
// - ホイール/ピンチした位置を中心に拡大縮小する(その位置のコンテンツ
//   座標を逆算し、拡大後も同じ位置に留まるようpanを再計算する)
// - Pointer Events APIでマウス・タッチを統一的に扱う(ライブラリ不使用)。
//   1本指/マウスドラッグでパン、2本指ピンチでズーム
// - ズーム範囲はMIN_SCALE〜MAX_SCALEに制限
// - リセットボタン: PanelHandleの「ダブルクリックで既定幅にリセット」と
//   同じパターンに揃え、既定表示(拡大率100%・パン無し)へ戻す
//   シンプルな実装にしている(全ノードのバウンディングボックスを計算して
//   画面に収める、より高度な「フィット」は行っていない)
// - 慣性スクロールはスコープ外(3.9で将来検討と明記済み)
// - 実装はホイールのnativeイベントリスナー(passive:falseでpreventDefault
//   するため)以外はJSXのPointer Eventsハンドラのみで完結している
//
// フェーズ7のスコープ(3.1・3.8):
// - ツリーはスナップショット。表示中は他端末からの同期更新
//   (メモ内容・有効なモデルの選択含む)を反映しない。最新化したい
//   場合は更新ボタン(centerUidが同じでも展開useEffectを再実行させる
//   refreshKeyをインクリメントするだけ)か、ノードクリックによる
//   再センタリングを使う
// - モデル切り替え(全メモ再計算)中は、起動ボタン(NotesApp.tsx側)・
//   更新ボタン・再センタリングをすべてブロックする。新旧モデルの
//   ベクトルが混在した状態で展開してしまうのを防ぐため
// - 中心(または再センタリング先)のメモが見つからない場合
//   (他端末で削除されていた場合)は、フォールバック先を決める必要が
//   無いようエラー表示に留める。この検知は常時のバックグラウンド監視
//   ではなく、展開処理が走るタイミング(初回表示・更新・再センタリング)
//   でのみ行われる
//
// フェーズ6のスコープ(3.7):
// - 子ノード(ゴースト含む)クリック: 再センタリング。onOpen()が
//   NotesApp側のselectedUidを更新し、それがcenterUidプロップとして
//   このコンポーネントへ伝播するため、既存の階層展開useEffect
//   (centerUidが依存配列に入っている)が自動的に新しい中心から
//   再展開する。ツリー表示は閉じない
// - 中心ノードクリック: 既にそのメモが選択されている状態なので、
//   ツリー表示を閉じるだけで良い(onOpen()は呼ばない)
// - 閲覧履歴との統合: onOpen()はNotesApp内部でuseNoteHistoryへの
//   記録も行うため、再センタリングで辿った経路をAlt+←/→でそのまま
//   遡れる。逆にAlt+←/→でcenterUidが変化した場合も、同じ仕組みで
//   ツリー表示が自動的に追従する(この副作用は狙って設計したもの)
//
// フェーズ5のスコープ(3.6): 角度補正(フェーズ4)でも緩和しきれない、
// 角度差が大きい(≒対角線上など著しく離れた)ノード間の横断リンクは、
// 長い線を引く代わりに接続先の近くに相手ノードの複製(ゴーストノード)を
// 表示する。判定基準は「角度差が一定以上」というシンプルな条件のみ
// (フローチャートのオフページコネクタと同じ考え方)
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
// 拡大縮小(フェーズ8)は未実装
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
/** この角度差(ラジアン)を超える横断リンクはゴーストノード化する(3.6) */
const GHOST_ANGLE_THRESHOLD = Math.PI * 0.6;
/** ゴーストノードをアンカーからどれだけ離すか(px) */
const GHOST_OFFSET_RADIUS = 80;
/** ゴーストノードをアンカー自身の角度から少しずらす量(ラジアン。アンカー自身の子ノードと重なりにくくするため) */
const GHOST_OFFSET_ANGLE = Math.PI * 0.22;
/** ズーム倍率の下限・上限(3.9) */
const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;
/** マウスホイール1刻みあたりの倍率変化 */
const WHEEL_ZOOM_FACTOR = 1.12;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

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

interface GhostNode {
  /** ゴーストの元になっている実ノードのuid(クリック時に開くメモ) */
  uid: string;
  title: string;
  /** どのノードの近くに表示するゴーストか(Reactキー・線の起点にも使う) */
  anchorUid: string;
  x: number;
  y: number;
}

/** 親子関係(発見経路)のペアを正規化したキーで管理する(横断リンクと重複させないため) */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Props {
  notes: Note[];
  centerUid: string;
  modelId: string;
  /** モデル切り替え(全メモ再計算)中は起動・更新・再センタリングをブロックする(3.8) */
  modelSwitching: boolean;
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

/** 2つの角度の差(0〜π。円環をまたぐ場合も正しく最短差を返す) */
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
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
  ghost = false,
  onClick,
  children,
}: {
  x: number;
  y: number;
  width: number;
  opacity: number;
  /** ゴーストノード(複製表示)の場合、破線・半透明の見た目にする(3.6) */
  ghost?: boolean;
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
      className={
        ghost
          ? 'absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border border-dashed border-white/20 bg-[#12151f]/50 px-3 py-2 text-left backdrop-blur-sm hover:border-indigo-400/40'
          : 'absolute -translate-x-1/2 -translate-y-1/2 rounded-xl ring-1 ring-white/10 bg-[#12151f]/90 px-3 py-2 text-left shadow-xl shadow-black/40 backdrop-blur-xl hover:scale-[1.04] hover:ring-indigo-400/40'
      }
    >
      {children}
    </button>
  );
}

export default function NoteTreeView({
  notes,
  centerUid,
  modelId,
  modelSwitching,
  onOpen,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [expanding, setExpanding] = useState(true);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [crossLinks, setCrossLinks] = useState<CrossLink[]>([]);
  // 更新ボタン(3.1・3.8)。centerUidが変わらなくても、これをインクリメント
  // すると展開useEffectが再実行され、開き直しと同じ扱いで取り直せる
  const [refreshKey, setRefreshKey] = useState(0);
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

  // 拡大縮小・パン操作(3.9)。Google Mapsのような操作感を目指し、
  // ホイール/ピンチした位置を中心に拡大縮小する。ライブラリは使わず
  // Pointer Events APIでマウス・タッチを統一的に扱う
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // ホイールのnativeイベントリスナー(passive:falseでpreventDefaultするため
  // useEffectで手動addEventListenerする必要がある)は空の依存配列で1度だけ
  // 登録するため、常に最新のscale/panをrefで参照する
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const prevScale = scaleRef.current;
      const prevPan = panRef.current;
      const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const newScale = clamp(prevScale * factor, MIN_SCALE, MAX_SCALE);
      // ホイール位置(=カーソル位置)が拡大縮小後も同じ場所を指すよう、
      // その位置の「コンテンツ座標」を求めてから逆算する
      const contentX = (mouseX - prevPan.x) / prevScale;
      const contentY = (mouseY - prevPan.y) / prevScale;
      setScale(newScale);
      setPan({ x: mouseX - contentX * newScale, y: mouseY - contentY * newScale });
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  // ドラッグ(パン)・ピンチ(ズーム)の進行中の状態。頻繁に更新される
  // ブックキーピング用の値なのでrefで保持し、再レンダーは起こさない
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragRef = useRef<
    | { mode: 'pan'; startPan: { x: number; y: number }; startPointer: { x: number; y: number } }
    | {
        mode: 'pinch';
        startScale: number;
        startDist: number;
        startPan: { x: number; y: number };
        focus: { x: number; y: number };
      }
    | null
  >(null);

  const handleAreaPointerDown = (e: React.PointerEvent) => {
    // ノードボタン上でのポインターダウンではパン/ピンチを開始しない。
    // setPointerCaptureはclickイベントの対象も巻き取ってしまうため、
    // ここで捕捉するとボタンのonClickが発火しなくなってしまう
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { mode: 'pan', startPan: pan, startPointer: { x: e.clientX, y: e.clientY } };
    } else if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const rect = areaRef.current?.getBoundingClientRect();
      const focus = rect
        ? { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top }
        : { x: 0, y: 0 };
      dragRef.current = { mode: 'pinch', startScale: scale, startDist: dist, startPan: pan, focus };
    }
  };

  const handleAreaPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'pan' && pointersRef.current.size === 1) {
      const dx = e.clientX - drag.startPointer.x;
      const dy = e.clientY - drag.startPointer.y;
      setPan({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
    } else if (drag.mode === 'pinch' && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const newScale = clamp(drag.startScale * (dist / drag.startDist), MIN_SCALE, MAX_SCALE);
      const contentX = (drag.focus.x - drag.startPan.x) / drag.startScale;
      const contentY = (drag.focus.y - drag.startPan.y) / drag.startScale;
      setScale(newScale);
      setPan({ x: drag.focus.x - contentX * newScale, y: drag.focus.y - contentY * newScale });
    }
  };

  const handleAreaPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const [pt] = [...pointersRef.current.values()];
      dragRef.current = { mode: 'pan', startPan: pan, startPointer: pt };
    }
  };

  // 全体を画面に収めるリセットボタン(3.9)。PanelHandleの「ダブルクリックで
  // 既定幅にリセット」と同じ「元に戻す」パターンに揃え、既定表示
  // (拡大率100%・パン無し)へ戻すシンプルな実装にしている
  const handleResetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    // 中心(または再センタリング先)のメモが他端末で削除されていた場合(3.8)。
    // 常時監視ではなく、この展開処理が走るタイミング(初回表示・更新
    // ボタン・再センタリング)でのみ検知する。実際のエラー表示は
    // レンダー時に!centerを直接見て行うため、ここでは展開しないだけで良い
    if (!center) {
      setExpanding(false);
      return;
    }
    let cancelled = false;
    setExpanding(true);
    setNodes([]);
    setCrossLinks([]);

    (async () => {
      const seen = new Set<string>([center.uid]);
      const allNodes: TreeNode[] = [];
      // 横断リンク(3.5)を階層展開と同時並行で計算するための状態。
      // 「新しいノードが追加されるたびに、既に表示中の全ノードとの
      // 横断リンクをその場でチェックする」方式にすることで、どのペアも
      // 「後から追加された方」のタイミングで必ず1回チェックされ、
      // 重複計算・漏れ無く全ペアを網羅できる(提案書3.5参照)
      const linkMap = new Map<string, CrossLink>();
      const visibleSoFar: { uid: string; title: string; body: string }[] = [
        { uid: center.uid, title: center.title, body: center.body },
      ];

      // 指定ノードと、既に表示中の全ノード(excludeUidsは除く)との
      // 横断リンクをバックグラウンドでチェックする。階層展開の続行を
      // 妨げないようawaitしない(fire-and-forget)。解決した時点で
      // linkMapを更新し、変化があればsetCrossLinksへ反映する
      const checkCrossLinksInBackground = (
        query: { uid: string; title: string; body: string },
        excludeUids: Set<string>,
      ) => {
        const candidates = visibleSoFar.filter(
          (v) => v.uid !== query.uid && !excludeUids.has(v.uid),
        );
        if (candidates.length === 0) return;
        const docs = candidates.map((v) => ({ id: v.uid, title: v.title, body: v.body }));
        vectorSearch(`${query.title}\n${query.body}`, docs, docs.length, modelId).then(
          (results) => {
            if (cancelled) return;
            let changed = false;
            for (const r of results) {
              const key = pairKey(query.uid, r.uid);
              const existing = linkMap.get(key);
              if (!existing || existing.score < r.score) {
                linkMap.set(key, { a: query.uid, b: r.uid, score: r.score });
                changed = true;
              }
            }
            if (changed) setCrossLinks([...linkMap.values()]);
          },
        );
      };

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
            const body = notes.find((n) => n.uid === item.uid)?.body ?? '';
            const node: TreeNode = {
              uid: item.uid,
              title: item.title,
              score: item.score,
              depth,
              angle,
              parentUid: parent.uid,
            };
            allNodes.push(node);
            nextLevel.push({ uid: item.uid, title: item.title, body, angle });
            // 親(バックボーンの相手)は除外して、既に表示中の全ノードと
            // 横断リンクをチェックしてから、自分自身をvisibleSoFarへ
            // 追加する(同じバッチ内の兄弟ノードにも正しく反映されるように)
            checkCrossLinksInBackground(
              { uid: item.uid, title: item.title, body },
              new Set([parent.uid]),
            );
            visibleSoFar.push({ uid: item.uid, title: item.title, body });
          });
          // 親ノード1件処理するたびに反映(段階的展開)
          setNodes([...allNodes]);
        }

        currentLevel = nextLevel;
        if (currentLevel.length === 0) break; // これ以上広がる先が無い
      }

      // 中心ノード自身の横断リンクは、他のノードのように「後から追加された
      // 側のチェック」で自然にはカバーされない(中心は最初から表示されて
      // いるため)。展開完了後にまとめて1回だけチェックする
      if (!cancelled) {
        const directChildrenOfCenter = new Set(
          allNodes.filter((n) => n.parentUid === center.uid).map((n) => n.uid),
        );
        checkCrossLinksInBackground(
          { uid: center.uid, title: center.title, body: center.body },
          directChildrenOfCenter,
        );
      }

      if (!cancelled) setExpanding(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [center, notes, modelId, refreshKey]);

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

  // 中心(または再センタリング先)のメモが他端末で削除されていた場合(3.8)。
  // どのメモにフォールバックするかを決める必要が無いよう、エラー表示に
  // 留める(閉じることはできる)
  if (!center) {
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
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-400">{t('noteTree.noteDeleted')}</p>
        </div>
      </div>
    );
  }

  // 中心のメモをクリック: 既にこのメモが選択されている状態なので、
  // ツリー表示を閉じてEditorへ戻るだけで良い(3.7)
  const handleCenterClick = () => {
    onClose();
  };

  // 子ノード(ゴースト含む)をクリック: 再センタリング(3.7)。onOpen()は
  // NotesApp側のselectedUidを更新し、それがcenterUidプロップとして
  // このコンポーネントへ伝播するため、既存の階層展開useEffectが
  // (centerUidの変化を検知して)自動的に新しい中心から再展開する。
  // onClose()は呼ばない(ツリー表示は開いたまま)。onOpen()は内部で
  // 閲覧履歴(useNoteHistory)にも記録するため、ツリー内で辿った経路を
  // 既存のAlt+←/→でそのまま遡れる。モデル切り替え中は取り直しを
  // ブロックする(3.8)
  const handleChildClick = (uid: string) => {
    if (modelSwitching) return;
    onOpen(uid);
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

  // ゴーストノード(3.6・フェーズ5): 角度差が大きい横断リンクは、長い線を
  // 引く代わりにアンカー(a)の近くにb の複製を表示する。中心が絡む横断
  // リンクは半径0(=常に短い線)のため対象外にする。線を引く先は
  // ghostPosByLinkKey にあればそちらを優先する(実ノードへの長い線は引かない)
  const angleByUid = new Map<string, number>(
    nodes.map((n) => [n.uid, adjustedAngleByUid.get(n.uid) ?? n.angle]),
  );
  const ghosts: GhostNode[] = [];
  const ghostPosByLinkKey = new Map<string, { x: number; y: number }>();
  for (const link of crossLinks) {
    if (link.a === center.uid || link.b === center.uid) continue;
    const angleA = angleByUid.get(link.a);
    const angleB = angleByUid.get(link.b);
    const anchorPos = absPosByUid.get(link.a);
    if (angleA == null || angleB == null || !anchorPos) continue;
    if (angleDiff(angleA, angleB) < GHOST_ANGLE_THRESHOLD) continue;
    const offset = polarToXY(GHOST_OFFSET_RADIUS, angleA + GHOST_OFFSET_ANGLE);
    const ghostPos = { x: anchorPos.x + offset.x, y: anchorPos.y + offset.y };
    const bTitle = nodes.find((n) => n.uid === link.b)?.title ?? '';
    ghosts.push({ uid: link.b, title: bTitle, anchorUid: link.a, ...ghostPos });
    ghostPosByLinkKey.set(pairKey(link.a, link.b), ghostPos);
  }

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
          {modelSwitching && (
            <span className="ml-2 text-xs font-normal text-amber-400/80">
              {t('noteTree.modelSwitchingBlocked')}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetView}
            title={t('noteTree.resetView')}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            ⤢ {t('noteTree.resetView')}
          </button>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={modelSwitching || expanding}
            title={modelSwitching ? t('noteTree.modelSwitchingBlocked') : undefined}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            ⟳ {t('noteTree.refresh')}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
          >
            ✕ {t('noteTree.close')}
          </button>
        </div>
      </div>

      <div
        ref={areaRef}
        onPointerDown={handleAreaPointerDown}
        onPointerMove={handleAreaPointerMove}
        onPointerUp={handleAreaPointerUp}
        onPointerCancel={handleAreaPointerUp}
        className="relative flex-1 touch-none select-none overflow-hidden active:cursor-grabbing"
      >
        {nodes.length === 0 && expanding && (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-slate-500">
            {t('noteTree.loading')}
          </p>
        )}

        {/* 拡大縮小・パン操作(3.9)の対象レイヤー。ノード配置計算(absPosByUid等)は
            そのままに、この階層でtransformをかけるだけでズーム/パンを実現する */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
        {areaSize.w > 0 && (
          <>
            {/* 横断リンク(3.5): メインの線より下のレイヤーに、細く・薄く曲線で描画する。
                ゴーストノード(フェーズ5)がある場合は、実ノードではなく
                ゴーストの位置へ短い線を引く */}
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              {crossLinks.map((link) => {
                const posA = absPosByUid.get(link.a);
                const posB =
                  ghostPosByLinkKey.get(pairKey(link.a, link.b)) ?? absPosByUid.get(link.b);
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
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
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
          onClick={handleCenterClick}
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
              onClick={() => handleChildClick(node.uid)}
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

        {/* ゴーストノード(3.6・フェーズ5): 角度差が大きい横断リンクの
            複製表示。本体と見分けがつくよう破線・半透明にし、
            クリック時の挙動は本体と同じにする */}
        {ghosts.map((g) => (
          <TreeNodeButton
            key={`ghost-${g.anchorUid}-${g.uid}`}
            x={g.x}
            y={g.y}
            width={11 * 16 * 0.8}
            opacity={0.7}
            ghost
            onClick={() => handleChildClick(g.uid)}
          >
            <div className="truncate text-[11px] text-slate-400">
              ⇢ {g.title || t('common.untitled')}
            </div>
          </TreeNodeButton>
        ))}
        </div>
      </div>
    </div>
  );
}
