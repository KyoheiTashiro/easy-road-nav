import * as stylex from "@stylexjs/stylex";
import { formatDuration, formatKm } from "@/model/format.ts";
import type { NarrowSegment } from "@/model/narrow.ts";
import { tollDistance, turnCount, type RouteModel } from "@/model/route.ts";
import { useSaved } from "@/store/saved.ts";
import { NarrowIcon, TurnsIcon } from "@/ui/icons/index.tsx";
import { colors } from "@/ui/tokens.stylex.ts";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  compact: { display: "contents" }, // 親のグリッドに 1 行目・2 行目を直接並べる
  placeholder: { fontSize: 16, lineHeight: "24px" },
  main: { display: "flex", alignItems: "baseline", gap: 8, lineHeight: "30px" },
  time: { fontSize: 24, fontWeight: 700 },
  km: { fontSize: 16, opacity: 0.8 },
  sub: {
    display: "flex",
    flexWrap: "wrap",
    gridColumn: "1 / -1",
    alignItems: "center",
    gap: "2px 8px",
    fontSize: 14,
    lineHeight: "20px",
  },
  stat: { display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" },
  narrowChip: {
    padding: "0 6px",
    borderRadius: 4,
    backgroundColor: colors.narrow,
    color: "#fff",
    fontWeight: 600,
  },
  ok: { color: colors.ok, fontWeight: 600 },
  spinner: {
    width: 16,
    height: 16,
    flexShrink: 0,
    alignSelf: "center",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.border,
    borderTopColor: colors.accent,
    borderRadius: "50%",
    animationName: spin,
    animationDuration: "0.8s",
    animationIterationCount: "infinite",
    animationTimingFunction: "linear",
  },
  cards: { display: "flex", flexDirection: "column", gap: 6 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    textAlign: "left",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.fg,
    cursor: "pointer",
  },
  selected: { borderColor: colors.accent },
  label: { fontSize: 12, fontWeight: 600, opacity: 0.7, marginRight: 4 },
});

/** 2 行目: 細い道（主役）/ 有料 / 右左折。ピーク行と代替カードで共通。iconOnly は文言を落とし aria-label に残す */
function Stats({ route, narrow }: { route: RouteModel; narrow: NarrowSegment[] }) {
  const iconOnly = useSaved((s) => s.iconOnly);
  const toll = tollDistance(route);
  const narrowM = narrow.reduce((sum, s) => sum + s.length, 0);
  const narrowText = `細い道 ${formatKm(narrowM)}`;
  const turnsText = `右左折 ${turnCount(route)} 回`;
  return (
    <div {...stylex.props(styles.sub)}>
      {narrowM > 0 ? (
        <span {...stylex.props(styles.stat, styles.narrowChip)} aria-label={narrowText}>
          <NarrowIcon size={16} />
          {iconOnly ? formatKm(narrowM) : narrowText}
        </span>
      ) : (
        !iconOnly && <span {...stylex.props(styles.stat, styles.ok)}>細い道なし</span>
      )}
      {toll > 0 && <span {...stylex.props(styles.stat)}>有料 {formatKm(toll)}</span>}
      <span {...stylex.props(styles.stat)} aria-label={turnsText}>
        <TurnsIcon size={18} />
        {iconOnly ? turnCount(route) : turnsText}
      </span>
    </div>
  );
}

function Main({ route, label }: { route: RouteModel; label?: string }) {
  return (
    <div {...stylex.props(styles.main)}>
      {label && <span {...stylex.props(styles.label)}>{label}</span>}
      <span {...stylex.props(styles.time)}>{formatDuration(route.time)}</span>
      <span {...stylex.props(styles.km)}>{formatKm(route.distance)}</span>
    </div>
  );
}

type RouteSummaryProps = {
  routes: RouteModel[];
  narrows: NarrowSegment[][]; // routes と同じ index
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  compact: boolean; // true = ピーク行（選択経路。所要時間が主役）、false = 代替カード
};

export function RouteSummary({
  routes,
  narrows,
  selected,
  onSelect,
  loading,
  compact,
}: RouteSummaryProps) {
  if (compact) {
    const route = routes[selected];
    if (loading || !route) {
      return (
        <div {...stylex.props(styles.main)}>
          {loading && <div {...stylex.props(styles.spinner)} />}
          <span {...stylex.props(styles.placeholder)}>
            {loading ? "探索中…" : "出発地と到着地を設定してください"}
          </span>
        </div>
      );
    }
    return (
      <div {...stylex.props(styles.compact)}>
        <Main route={route} />
        <Stats route={route} narrow={narrows[selected] ?? []} />
      </div>
    );
  }
  if (routes.length < 2) return null; // 1 本ならピーク行と重複
  return (
    <div {...stylex.props(styles.cards)}>
      {routes.map((r, i) => (
        <button
          key={i}
          {...stylex.props(styles.card, i === selected && styles.selected)}
          onClick={() => onSelect(i)}
          aria-pressed={i === selected}
        >
          <Main route={r} label={i === 0 ? "推奨" : `代替 ${i}`} />
          <Stats route={r} narrow={narrows[i] ?? []} />
        </button>
      ))}
    </div>
  );
}
