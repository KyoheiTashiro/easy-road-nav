import * as stylex from "@stylexjs/stylex";
import { formatDistance } from "@/shared/format.ts";
import { entersNarrow, type NarrowSegment } from "@/route/narrow.ts";
import type { RouteModel } from "@/route/route.ts";
import { useSaved } from "@/settings/saved.ts";
import { DirectionIcon } from "@/route/DirectionIcon.tsx";
import { NarrowIcon } from "@/shared/icons/index.tsx";
import { colors } from "@/shared/tokens.stylex.ts";

const styles = stylex.create({
  list: { listStyle: "none", margin: 0, padding: 0 },
  row: {
    display: "flex",
    gap: 10,
    padding: 8,
    marginLeft: -8, // 背景色を本文の余白まではみ出させる
    marginRight: -8,
    borderRadius: 6,
    borderTopWidth: { default: 1, ":first-child": 0 }, // 区切りは BottomSheet の section が引く
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  narrowRow: { backgroundColor: colors.narrowBackground }, // 経路線の細い道（オレンジ）と対応
  icon: { flexShrink: 0, color: colors.accent, paddingTop: 2 },
  body: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  warn: { display: "flex", fontSize: 12, fontWeight: 600, color: colors.narrow },
  text: { fontSize: 14 },
  meta: { fontSize: 12, opacity: 0.7 },
});

/** instructions を全部表示（sign 0 含む）。細い道区間に入るステップの先頭に「⚠ 細い道」（iconOnly はアイコンだけ） */
export function StepList({ route, narrow }: { route: RouteModel; narrow: NarrowSegment[] }) {
  const iconOnly = useSaved((state) => state.iconOnly);
  const { cumulativeDistances } = route;

  return (
    <ol {...stylex.props(styles.list)}>
      {route.instructions.map((instruction, i) => {
        const enters = entersNarrow(instruction, narrow);
        return (
          <li key={i} {...stylex.props(styles.row, enters && styles.narrowRow)}>
            <span {...stylex.props(styles.icon)}>
              <DirectionIcon sign={instruction.sign} />
            </span>
            <div {...stylex.props(styles.body)}>
              {enters && (
                <span {...stylex.props(styles.warn)} aria-label="細い道">
                  {iconOnly ? <NarrowIcon size={14} /> : "⚠ 細い道"}
                </span>
              )}
              <span {...stylex.props(styles.text)}>{instruction.text}</span>
              <span {...stylex.props(styles.meta)}>
                {formatDistance(
                  cumulativeDistances[instruction.to]! - cumulativeDistances[instruction.from]!,
                )}
                {instruction.streetName && ` · ${instruction.streetName}`}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
