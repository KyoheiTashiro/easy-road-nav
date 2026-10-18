import * as stylex from "@stylexjs/stylex";
import { button } from "./button.stylex.ts";

const styles = stylex.create({
  box: { display: "flex", flexDirection: "column", gap: 8, minWidth: 180, color: "#1a1a1a" },
  label: { fontSize: 14, fontWeight: 600 },
  row: { display: "flex", flexDirection: "column", gap: 4 },
});

type PointPopupProps = {
  label: string | null; // null = 逆ジオ中
  canAddVia: boolean;
  onAction(role: "from" | "to" | "via"): void;
};

export function PointPopup({ label, canAddVia, onAction }: PointPopupProps) {
  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.label)}>{label ?? "…"}</div>
      <div {...stylex.props(styles.row)}>
        <button {...stylex.props(button.base)} onClick={() => onAction("to")}>
          到着地にする
        </button>
        <button
          {...stylex.props(button.base)}
          disabled={!canAddVia}
          onClick={() => onAction("via")}
        >
          経由地に追加
        </button>
        <button {...stylex.props(button.base)} onClick={() => onAction("from")}>
          出発地にする
        </button>
      </div>
    </div>
  );
}
