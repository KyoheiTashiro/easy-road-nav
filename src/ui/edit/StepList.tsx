import * as stylex from "@stylexjs/stylex";
import { formatDistance } from "@/model/format.ts";
import { entersNarrow, type NarrowSegment } from "@/model/narrow.ts";
import type { RouteModel } from "@/model/route.ts";
import { DirectionIcon } from "@/ui/icons/index.tsx";
import { colors } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  list: { listStyle: "none", margin: 0, padding: 0 },
  row: {
    display: "flex",
    gap: 10,
    padding: "8px 8px",
    marginLeft: -8, // 背景色を本文の余白まではみ出させる
    marginRight: -8,
    borderRadius: 6,
    borderTopWidth: { default: 1, ":first-child": 0 }, // 区切りは BottomSheet の section が引く
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  narrowRow: { backgroundColor: colors.narrowBg }, // 経路線の細い道（オレンジ）と対応
  icon: { flexShrink: 0, color: colors.accent, paddingTop: 2 },
  body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  warn: { fontSize: 12, fontWeight: 600, color: colors.narrow },
  text: { fontSize: 14 },
  meta: { fontSize: 12, opacity: 0.7 },
});

/** instructions を全部表示（sign 0 含む）。細い道区間に入るステップの先頭に「⚠ 細い道」 */
export function StepList({ route, narrow }: { route: RouteModel; narrow: NarrowSegment[] }) {
  const { cum } = route;
  return (
    <ol {...stylex.props(styles.list)}>
      {route.instructions.map((ins, i) => {
        const enters = entersNarrow(ins, narrow);
        return (
          <li key={i} {...stylex.props(styles.row, enters && styles.narrowRow)}>
            <span {...stylex.props(styles.icon)}>
              <DirectionIcon sign={ins.sign} />
            </span>
            <div {...stylex.props(styles.body)}>
              {enters && <span {...stylex.props(styles.warn)}>⚠ 細い道</span>}
              <span {...stylex.props(styles.text)}>{ins.text}</span>
              <span {...stylex.props(styles.meta)}>
                {formatDistance(cum[ins.to]! - cum[ins.from]!)}
                {ins.streetName && ` · ${ins.streetName}`}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
