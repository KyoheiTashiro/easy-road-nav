import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";
import { ROLE, type Point } from "@/model/point.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { useSaved } from "@/store/saved.ts";
import { selectLoading, selectNarrows, selectRoutes, tripActions, useTrip } from "@/store/trip.ts";
import { RouteSummary } from "@/ui/edit/RouteSummary.tsx";
import { StepList } from "@/ui/edit/StepList.tsx";
import { button } from "@/ui/button.stylex.ts";
import { HomeIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors } from "@/ui/tokens.stylex.ts";
const SWIPE_PX = 30;

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
    paddingBottom: "env(safe-area-inset-bottom)",
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: "16px 16px 0 0",
    boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
    transition: "max-height 0.25s ease",
    zIndex: 5,
  },
  expanded: { maxHeight: "70vh" },
  header: { flexShrink: 0, minHeight: `${layout.peek}px` }, // ピーク時に body が覗かないよう高さを揃える
  handle: { padding: "10px 0 6px" },
  bar: { width: 40, height: 4, borderRadius: 2, margin: "0 auto", backgroundColor: colors.border },
  summary: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 16px 12px",
    fontSize: 15,
    lineHeight: "24px",
  },
  summaryText: { flex: 1, minWidth: 0 },
  start: { flexShrink: 0 },
  // スクロールは常に body。overflow を切り替えると iOS がタッチ開始時にスクロール対象を取り違える
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain", // 地図への連鎖・Android の pull-to-refresh を防ぐ
    padding: "0 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: { display: "flex", alignItems: "center", gap: 8, minHeight: 36 },
  passed: { opacity: 0.5 },
  note: { flexShrink: 0, fontSize: 12 },
  role: { flexShrink: 0, width: 64, fontSize: 12, fontWeight: 600, color: colors.fg, opacity: 0.6 },
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
  p,
  passed = false,
  onDelete,
  children,
}: {
  role: string;
  p: Point | null;
  passed?: boolean;
  onDelete(): void;
  children?: React.ReactNode;
}) {
  return (
    <li {...stylex.props(styles.row, passed && styles.passed)}>
      <span {...stylex.props(styles.role)}>{role}</span>
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
        <span {...stylex.props(styles.unset)}>未設定（地図をタップ）</span>
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
  const home = useSaved((s) => s.home);
  const routes = useTrip(selectRoutes);
  const narrows = useTrip(selectNarrows);
  const selected = useTrip((s) => s.selected);
  const starting = useNav((s) => s.starting);
  const loading = useTrip(selectLoading) || starting;
  const canStart = useTrip((s) => s.fix !== null && !s.gpsError) && routes.length > 0 && !starting;
  const route = routes[selected];
  const summaryProps = { routes, narrows, selected, onSelect: tripActions.routeSelected, loading };
  const body = useRef<HTMLDivElement>(null);
  const touchY = useRef(0);
  const touchScrollTop = useRef(0);
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchY.current = e.touches[0]?.clientY ?? 0;
    touchScrollTop.current = body.current?.scrollTop ?? 0;
  };
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const dy = (e.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    if (Math.abs(dy) < SWIPE_PX) return;
    // 途中からのスクロールで先頭に戻っても閉じない。先頭にいる状態で始めた下スワイプだけ閉じる
    if (dy > 0 && touchScrollTop.current > 0) return;
    tripActions.setSheet(dy < 0);
  };
  return (
    <div
      {...stylex.props(styles.sheet, expanded && styles.expanded)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.handle)}>
          <div {...stylex.props(styles.bar)} />
        </div>
        <div {...stylex.props(styles.summary)}>
          <div {...stylex.props(styles.summaryText)}>
            <RouteSummary {...summaryProps} compact />
          </div>
          <button
            {...stylex.props(button.base, button.primary, styles.start)}
            disabled={!canStart}
            onClick={navActions.start}
          >
            案内開始
          </button>
        </div>
      </div>
      <div ref={body} {...stylex.props(styles.body)}>
        <ul {...stylex.props(styles.list)}>
          <Row role="出発地" p={from} onDelete={() => tripActions.pointDeleted(ROLE.FROM)} />
          {vias.map((v, i) => (
            <Row
              key={i}
              role={`経由地 ${i + 1}`}
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
          <Row role="到着地" p={to} onDelete={() => tripActions.pointDeleted(ROLE.TO)} />
        </ul>
        <label {...stylex.props(styles.toggle)}>
          <input
            type="checkbox"
            checked={notoll}
            onChange={(e) => tripActions.notollToggled(e.target.checked)}
          />
          高速・有料を避ける
        </label>
        <div {...stylex.props(styles.row)}>
          <HomeIcon size={20} />
          {home ? (
            <>
              <span {...stylex.props(styles.name)}>{home.label}</span>
              <button {...stylex.props(button.base)} onClick={tripActions.homeSetupEntered}>
                変更
              </button>
            </>
          ) : (
            <button {...stylex.props(button.base)} onClick={tripActions.homeSetupEntered}>
              自宅を設定
            </button>
          )}
        </div>
        <RouteSummary {...summaryProps} compact={false} />
        {route && <StepList route={route} narrow={narrows[selected] ?? []} />}
      </div>
    </div>
  );
}
