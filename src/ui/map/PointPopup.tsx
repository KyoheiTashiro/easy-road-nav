import * as stylex from "@stylexjs/stylex";
import { ROLE, type PointRole } from "@/model/point.ts";
import { MODE } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { fixedColors } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 180,
    color: fixedColors.popupForeground,
  },
  label: { fontSize: 14, fontWeight: 600 },
  row: { display: "flex", flexDirection: "column", gap: 4 },
});

type PointPopupProps = {
  mode: typeof MODE.EDIT | typeof MODE.HOME_SETUP; // home = 「自宅にする」1 つ
  label: string | null; // null = 逆ジオ中
  canAddVia: boolean;
  onAction(role: PointRole): void;
  onHome(): void;
};

export function PointPopup({ mode, label, canAddVia, onAction, onHome }: PointPopupProps) {
  if (mode === MODE.HOME_SETUP) {
    return (
      <div {...stylex.props(styles.box)}>
        <div {...stylex.props(styles.label)}>{label ?? "…"}</div>
        <button {...stylex.props(button.base)} disabled={label === null} onClick={onHome}>
          自宅にする
        </button>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.label)}>{label ?? "…"}</div>
      <div {...stylex.props(styles.row)}>
        <button {...stylex.props(button.base)} onClick={() => onAction(ROLE.TO)}>
          到着地にする
        </button>
        <button
          {...stylex.props(button.base)}
          disabled={!canAddVia}
          onClick={() => onAction(ROLE.VIA)}
        >
          経由地に追加
        </button>
        <button {...stylex.props(button.base)} onClick={() => onAction(ROLE.FROM)}>
          出発地にする
        </button>
      </div>
    </div>
  );
}
