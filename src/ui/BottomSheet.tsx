import * as stylex from "@stylexjs/stylex";
import { useRef } from "react";
import type { NarrowSegment } from "../model/narrow.ts";
import type { Point, PointRole, RouteModel } from "../model/route.ts";
import { RouteSummary } from "./RouteSummary.tsx";
import { StepList } from "./StepList.tsx";
import { button } from "./button.stylex.ts";
import { colors } from "./tokens.stylex.ts";

/** ピーク時の高さ（px）。Map の fitBounds 下パディングに使う */
export const PEEK_HEIGHT = 80;
/** スワイプ判定の最小移動量（px） */
const SWIPE_PX = 30;

const styles = stylex.create({
  sheet: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: PEEK_HEIGHT,
    overflow: "hidden",
    paddingBottom: "env(safe-area-inset-bottom)",
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: "16px 16px 0 0",
    boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
    transition: "max-height 0.25s ease",
    zIndex: 5,
  },
  expanded: { maxHeight: "70vh", overflowY: "auto" },
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
  body: { padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 },
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

type BottomSheetProps = {
  expanded: boolean;
  onExpand(v: boolean): void; // 上スワイプで true、下スワイプで false
  from: Point | null;
  to: Point | null;
  vias: Point[];
  passedVia: number; // 通過済 表示用（先頭からこの数の経由地）
  onDelete(role: PointRole): void;
  onMoveVia(index: number, dir: -1 | 1): void;
  notoll: boolean;
  onNotoll(v: boolean): void;
  routes: RouteModel[];
  narrows: NarrowSegment[][];
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  canStart: boolean; // 経路あり かつ GPS fix あり
  onStart(): void;
};

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

export function BottomSheet(props: BottomSheetProps) {
  const { expanded, onExpand, from, to, vias, passedVia, onDelete, onMoveVia } = props;
  const { notoll, onNotoll } = props;
  const { routes, narrows, selected, onSelect, loading, canStart, onStart } = props;
  const route = routes[selected];
  const summaryProps = { routes, selected, onSelect, loading };
  const touchY = useRef(0);
  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const dy = (e.changedTouches[0]?.clientY ?? touchY.current) - touchY.current;
    if (Math.abs(dy) < SWIPE_PX) return;
    if (dy > 0 && e.currentTarget.scrollTop > 0) return; // リストのスクロール中は閉じない
    onExpand(dy < 0);
  };
  return (
    <div
      {...stylex.props(styles.sheet, expanded && styles.expanded)}
      onTouchStart={(e) => (touchY.current = e.touches[0]?.clientY ?? 0)}
      onTouchEnd={onTouchEnd}
    >
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
          onClick={onStart}
        >
          案内開始
        </button>
      </div>
      <div {...stylex.props(styles.body)}>
        <ul {...stylex.props(styles.list)}>
          <Row role="出発地" p={from} onDelete={() => onDelete("from")} />
          {vias.map((v, i) => (
            <Row
              key={i}
              role={`経由地 ${i + 1}`}
              p={v}
              passed={i < passedVia}
              onDelete={() => onDelete({ via: i })}
            >
              <button
                {...stylex.props(button.base, button.icon)}
                disabled={i === 0}
                onClick={() => onMoveVia(i, -1)}
                aria-label="上へ"
              >
                ▲
              </button>
              <button
                {...stylex.props(button.base, button.icon)}
                disabled={i === vias.length - 1}
                onClick={() => onMoveVia(i, 1)}
                aria-label="下へ"
              >
                ▼
              </button>
            </Row>
          ))}
          <Row role="到着地" p={to} onDelete={() => onDelete("to")} />
        </ul>
        <label {...stylex.props(styles.toggle)}>
          <input type="checkbox" checked={notoll} onChange={(e) => onNotoll(e.target.checked)} />
          高速・有料を避ける
        </label>
        <RouteSummary {...summaryProps} compact={false} />
        {route && <StepList route={route} narrow={narrows[selected] ?? []} />}
      </div>
    </div>
  );
}
