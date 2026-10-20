import * as stylex from "@stylexjs/stylex";
import { formatDuration, formatKm } from "@/model/format.ts";
import { tollDistance, type RouteModel } from "@/model/route.ts";
import { colors } from "@/ui/tokens.stylex.ts";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  compact: { display: "flex", alignItems: "center", gap: 8, fontSize: 15, lineHeight: "24px" },
  spinner: {
    width: 16,
    height: 16,
    flexShrink: 0,
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
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    color: colors.fg,
    cursor: "pointer",
  },
  selected: { borderColor: colors.accent, boxShadow: `inset 0 0 0 1px ${colors.accent}` },
});

function summaryText(route: RouteModel): string {
  const parts = [formatKm(route.distance), formatDuration(route.time)];
  const toll = tollDistance(route);
  if (toll > 0) parts.push(`有料区間 ${formatKm(toll)}`);
  return parts.join(" / ");
}

type RouteSummaryProps = {
  routes: RouteModel[];
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  compact: boolean; // true = ピーク行（選択経路 1 行）、false = 代替カード
};

export function RouteSummary({ routes, selected, onSelect, loading, compact }: RouteSummaryProps) {
  if (compact) {
    const route = routes[selected];
    let text = "出発地と到着地を設定してください";
    if (loading) text = "探索中…";
    else if (route) text = summaryText(route);
    return (
      <div {...stylex.props(styles.compact)}>
        {loading && <div {...stylex.props(styles.spinner)} />}
        {text}
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
          {i === 0 ? "推奨: " : `代替 ${i}: `}
          {summaryText(r)}
        </button>
      ))}
    </div>
  );
}
