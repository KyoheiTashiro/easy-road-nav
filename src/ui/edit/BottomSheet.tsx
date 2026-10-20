import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { ROLE, type Point } from "@/model/point.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { useSaved } from "@/store/saved.ts";
import { selectLoading, selectNarrows, selectRoutes, tripActions, useTrip } from "@/store/trip.ts";
import { RouteSummary } from "@/ui/edit/RouteSummary.tsx";
import { StepList } from "@/ui/edit/StepList.tsx";
import { button } from "@/ui/button.stylex.ts";
import { FromIcon, HomeIcon, ToIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors, marker } from "@/ui/tokens.stylex.ts";
const DOT = 24;

const styles = stylex.create({
  // 開閉はスクロールスナップ。spacer（透過）と sheet の 2 点に止まり、指追従・慣性・アニメはブラウザ任せ。
  // JS でシートの高さを触ると iOS がタップやスクロールを取りこぼすので、タッチは一切扱わない
  outer: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: `${layout.half}dvh`,
    overflowY: "auto",
    scrollSnapType: "y mandatory",
    overscrollBehavior: "none", // 地図への連鎖・Android の pull-to-refresh を防ぐ
    scrollbarWidth: "none",
    pointerEvents: "none", // spacer 越しに地図を操作できるように。sheet で戻す
    zIndex: 5,
  },
  spacer: { height: `calc(${layout.half}dvh - ${layout.peek}px)`, scrollSnapAlign: "start" },
  sheet: {
    height: `${layout.half}dvh`,
    scrollSnapAlign: "start",
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: "16px 16px 0 0",
    boxShadow: "0 -2px 12px rgba(0,0,0,0.2)",
  },
  // ピーク時に見える高さ。ホームインジケータ分は空けず、ボタンをその直上に置く
  header: { flexShrink: 0, minHeight: `${layout.peek}px` },
  handle: {
    display: "block",
    width: "100%",
    padding: "8px 0 4px",
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  bar: { width: 40, height: 4, borderRadius: 2, margin: "0 auto", backgroundColor: colors.border },
  summary: { display: "flex", alignItems: "center", gap: 12, padding: "0 16px 12px" },
  summaryText: { flex: 1, minWidth: 0, cursor: "pointer" },
  start: { flexShrink: 0, height: 52, padding: "0 20px", fontSize: 16 },
  // overscroll は既定のまま: リスト先頭で始めた下スワイプが outer へ連鎖してシートが閉じる（途中から始めたものは iOS が body にラッチして閉じない）
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "0 16px calc(16px + env(safe-area-inset-bottom))", // 末尾までスクロールしたときだけホームインジケータを避ける
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
  const home = useSaved((s) => s.home);
  const routes = useTrip(selectRoutes);
  const narrows = useTrip(selectNarrows);
  const selected = useTrip((s) => s.selected);
  const starting = useNav((s) => s.starting);
  const gpsOk = useTrip((s) => s.fix !== null && !s.gpsError);
  const loading = useTrip(selectLoading) || starting;
  const route = routes[selected];
  const summaryProps = { routes, narrows, selected, onSelect: tripActions.routeSelected, loading };
  const outer = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const toggle = () => tripActions.setSheet(!expanded);

  // store → スクロール位置。再展開は先頭から（前回のスクロール位置を残さない）。収納時に戻すと縮む途中で飛ぶ
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const top = expanded ? el.scrollHeight - el.clientHeight : 0;
    if (Math.abs(el.scrollTop - top) > 1) el.scrollTo({ top, behavior: "smooth" });
    if (expanded && body.current) body.current.scrollTop = 0;
  }, [expanded]);

  // スクロール位置 → store。スナップ点に止まったときだけ反映し、指追従中は触らない（store 変更で scrollTo が走ると指の下で跳ねる）
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (el.scrollTop <= 1) tripActions.setSheet(false);
      else if (el.scrollTop >= max - 1) tripActions.setSheet(true);
    };
    if (typeof el.onscrollend !== "undefined") {
      el.addEventListener("scrollend", sync);
      return () => el.removeEventListener("scrollend", sync);
    }
    // scrollend 未対応（Safari 26 未満）は scroll の静止で代用
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = window.setTimeout(sync, 150);
    };
    el.addEventListener("scroll", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={outer} {...stylex.props(styles.outer)}>
      <div {...stylex.props(styles.spacer)} />
      <div {...stylex.props(styles.sheet)}>
        <div {...stylex.props(styles.header)}>
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
    </div>
  );
}
