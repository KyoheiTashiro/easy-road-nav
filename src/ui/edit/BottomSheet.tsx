import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { ROLE, type Point } from "@/model/point.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { selectLoading, selectNarrows, selectRoutes, tripActions, useTrip } from "@/store/trip.ts";
import { RouteSummary } from "@/ui/edit/RouteSummary.tsx";
import { StepList } from "@/ui/edit/StepList.tsx";
import { button } from "@/ui/button.stylex.ts";
import { FromIcon, ToIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors, marker, shadows } from "@/ui/tokens.stylex.ts";
const SWIPE_PX = 30;
const DRAG_START_PX = 10; // iOS のタップ判定の揺れより大きく
const DOT = 24;

const styles = stylex.create({
  sheet: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: `${layout.peek}px`,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.bg,
    color: colors.fg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: shadows.up,
    transitionProperty: "max-height",
    transitionDuration: "0.25s",
    transitionTimingFunction: "ease",
    zIndex: 5,
  },
  empty: { maxHeight: `${layout.peekEmpty}px` },
  expanded: { maxHeight: `${layout.half}dvh` }, // vh だと Safari のツールバー表示中に innerHeight とずれ、指追従の終わりで跳ねる
  // ピーク時に body が覗かないよう高さを揃える。ホームインジケータ分は空けず、ボタンをその直上に置く
  header: {
    flexShrink: 0,
    minHeight: `${layout.peek}px`,
    display: "flex",
    flexDirection: "column",
  },
  headerEmpty: { minHeight: `${layout.peekEmpty}px` },
  handle: {
    display: "block",
    width: "100%",
    paddingTop: 8,
    paddingInline: 0,
    paddingBottom: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  bar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBlock: 0,
    marginInline: "auto",
    backgroundColor: colors.border,
  },
  // 2 行目はボタンの下まで使う（横に置くと 3 項目が揃ったとき重なる）
  summary: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignContent: "center",
    alignItems: "center",
    rowGap: 2,
    columnGap: 12,
    paddingTop: 0,
    paddingInline: 16,
    paddingBottom: 12,
  },
  summaryText: { display: "contents", cursor: "pointer" },
  start: {
    gridRow: 1,
    gridColumn: 2,
    height: 52,
    paddingBlock: 0,
    paddingInline: 16,
    fontSize: 16,
  },
  // スクロールは常に body。overflow を切り替えると iOS がタッチ開始時にスクロール対象を取り違える
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain", // 地図への連鎖・Android の pull-to-refresh を防ぐ
    paddingTop: 0,
    paddingInline: 16,
    paddingBottom: "calc(16px + env(safe-area-inset-bottom))", // 末尾までスクロールしたときだけホームインジケータを避ける
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  // 地点リスト: 検索欄と同じ記号（出発地 = 中空の丸、到着地 = ピン、経由地 = 番号）をマーカー色で塗り縦線で繋ぐ
  timeline: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    "::before": {
      content: '""',
      position: "absolute",
      left: DOT / 2 - 1,
      top: 18,
      bottom: 18,
      width: 2,
      backgroundColor: colors.border,
    },
  },
  row: { display: "flex", alignItems: "center", gap: 8, minHeight: 36 },
  mark: {
    position: "relative",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: DOT,
    height: DOT,
    backgroundColor: colors.bg, // 縦線を隠す
    color: colors.border, // 未設定
    fontSize: 14,
    fontWeight: 700,
  },
  from: { color: marker.from },
  via: { color: marker.via },
  to: { color: marker.to },
  passed: { opacity: 0.5 },
  note: { flexShrink: 0, fontSize: 12 },
  name: {
    flex: 1,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  unset: { flex: 1, fontSize: 14, opacity: 0.5 },
  toggle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14 },
});

function Row({
  role,
  dot,
  text = "",
  p,
  passed = false,
  onDelete,
  children,
}: {
  role: string; // aria 用（出発地 / 経由地 n / 到着地）
  dot: keyof typeof marker;
  text?: string; // 経由地の番号
  p: Point | null;
  passed?: boolean;
  onDelete(): void;
  children?: React.ReactNode;
}) {
  return (
    <li {...stylex.props(styles.row, passed && styles.passed)}>
      <span {...stylex.props(styles.mark, p && styles[dot])} aria-label={role}>
        {dot === "from" && <FromIcon size={20} />}
        {dot === "via" && text}
        {dot === "to" && <ToIcon size={20} />}
      </span>
      {p ? (
        <>
          <span {...stylex.props(styles.name)}>{p.label ?? "…"}</span>
          {passed && <span {...stylex.props(styles.note)}>通過済</span>}
          {children}
          <button
            {...stylex.props(button.base, button.icon)}
            onClick={onDelete}
            aria-label={`${role}を削除`}
          >
            ✕
          </button>
        </>
      ) : (
        <span {...stylex.props(styles.unset)}>{role}未設定（地図をタップ）</span>
      )}
    </li>
  );
}

export function BottomSheet() {
  const expanded = useTrip((s) => s.sheetExpanded);
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const vias = useTrip((s) => s.vias);
  const passedVia = useTrip((s) => s.passedVia);
  const notoll = useTrip((s) => s.notoll);
  const routes = useTrip(selectRoutes);
  const narrows = useTrip(selectNarrows);
  const selected = useTrip((s) => s.selected);
  const starting = useNav((s) => s.starting);
  const gpsOk = useTrip((s) => s.fix !== null && !s.gpsError);
  const loading = useTrip(selectLoading) || starting;
  const route = routes[selected];
  const empty = routes.length === 0;
  const peek = empty ? layout.peekEmpty : layout.peek;
  const summaryProps = { routes, narrows, selected, onSelect: tripActions.routeSelected, loading };
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const touchY = useRef(0);
  const touchScrollTop = useRef(0);
  const startHeight = useRef(0);
  const toggle = () => tripActions.setSheet(!expanded);

  // 再展開は先頭から（前回のスクロール位置を残さない）。収納時に戻すと縮む途中で飛ぶ
  useEffect(() => {
    if (expanded && body.current) body.current.scrollTop = 0;
  }, [expanded]);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchY.current = e.touches[0]?.clientY ?? 0;
    // ハンドル上の下スワイプはリストがスクロール済みでも閉じる
    touchScrollTop.current = body.current?.contains(e.target as Node) ? body.current.scrollTop : 0;
    startHeight.current = sheet.current?.getBoundingClientRect().height ?? 0;
  };
  // 指に追従。途中からのスクロールで先頭に戻っても閉じない。先頭にいる状態で始めた下スワイプだけ閉じる
  const dragAllowed = (dy: number) => !(dy > 0 && touchScrollTop.current > 0);
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = sheet.current;
    const dy = (e.touches[0]?.clientY ?? touchY.current) - touchY.current;
    if (!el || !dragAllowed(dy)) return;
    // 展開済みはリストのスクロールが主。シートの高さを触ると iOS がスクロールもタップも取りこぼす（先頭でタップ時の数 px の揺れでも起きる）ので、閉じ方向へ明確に動くまで触らない（追従開始後の反転は追従を続ける）
    if (expanded && dy < DRAG_START_PX && !el.style.maxHeight) return;
    const max = (window.innerHeight * layout.half) / 100;
    const h = Math.min(max, Math.max(peek, startHeight.current - dy));
    el.style.transition = "none";
    el.style.maxHeight = `${h}px`;
  };
  // 以降は class の max-height へアニメーション。touchcancel（画面端のシステムジェスチャ等）でも戻さないと固着する
  const resetStyle = () => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = "";
    el.style.maxHeight = "";
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    resetStyle();
    const dy = (e.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    if (Math.abs(dy) < SWIPE_PX || !dragAllowed(dy)) return;
    tripActions.setSheet(dy < 0);
  };
  return (
    <div
      ref={sheet}
      {...stylex.props(styles.sheet, empty && styles.empty, expanded && styles.expanded)}
      data-sheet-empty={empty || undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={resetStyle}
    >
      <div {...stylex.props(styles.header, empty && styles.headerEmpty)}>
        <button
          {...stylex.props(styles.handle)}
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "経路の詳細を閉じる" : "経路の詳細を開く"}
        >
          <div {...stylex.props(styles.bar)} />
        </button>
        <div {...stylex.props(styles.summary)}>
          <div {...stylex.props(styles.summaryText)} onClick={toggle}>
            <RouteSummary {...summaryProps} compact />
          </div>
          {routes.length > 0 && (
            <button
              {...stylex.props(button.base, button.primary, styles.start)}
              disabled={!gpsOk || starting}
              onClick={navActions.start}
            >
              {gpsOk ? "案内開始" : "GPS 待ち"}
            </button>
          )}
        </div>
      </div>
      <div ref={body} {...stylex.props(styles.body)}>
        <ul {...stylex.props(styles.timeline)}>
          <Row
            role="出発地"
            dot="from"
            p={from}
            onDelete={() => tripActions.pointDeleted(ROLE.FROM)}
          />
          {vias.map((v, i) => (
            <Row
              key={i}
              role={`経由地 ${i + 1}`}
              dot="via"
              text={String(i + 1)}
              p={v}
              passed={i < passedVia}
              onDelete={() => tripActions.viaDeleted(i)}
            >
              <button
                {...stylex.props(button.base, button.icon)}
                disabled={i === 0}
                onClick={() => tripActions.viaMoved(i, -1)}
                aria-label="上へ"
              >
                ▲
              </button>
              <button
                {...stylex.props(button.base, button.icon)}
                disabled={i === vias.length - 1}
                onClick={() => tripActions.viaMoved(i, 1)}
                aria-label="下へ"
              >
                ▼
              </button>
            </Row>
          ))}
          <Row role="到着地" dot="to" p={to} onDelete={() => tripActions.pointDeleted(ROLE.TO)} />
        </ul>
        <div {...stylex.props(styles.section)}>
          <label {...stylex.props(styles.toggle)}>
            <input
              type="checkbox"
              checked={notoll}
              onChange={(e) => tripActions.notollToggled(e.target.checked)}
            />
            高速・有料を避ける
          </label>
        </div>
        {routes.length > 1 && (
          <div {...stylex.props(styles.section)}>
            <RouteSummary {...summaryProps} compact={false} />
          </div>
        )}
        {route && (
          <div {...stylex.props(styles.section)}>
            <StepList route={route} narrow={narrows[selected] ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}
