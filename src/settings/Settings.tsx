import * as stylex from "@stylexjs/stylex";
import { savedActions, useSaved } from "@/settings/saved.ts";
import { tripActions } from "@/trip/trip.ts";
import { button } from "@/shared/button.stylex.ts";
import { HomeIcon } from "@/shared/icons/index.tsx";
import { colors } from "@/shared/tokens.stylex.ts";

const styles = stylex.create({
  // 地図はマウントしたまま不透明パネルで隠す（戻ったときの再初期化を避ける）
  panel: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    paddingTop: "calc(env(safe-area-inset-top) + 12px)",
    paddingInline: 16,
    paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
    backgroundColor: colors.background,
    color: colors.foreground,
  },
  header: { display: "flex", alignItems: "center", gap: 12 },
  title: { margin: 0, fontSize: 18, fontWeight: 700 },
  row: { display: "flex", alignItems: "center", gap: 8, minHeight: 36, fontSize: 14 },
  name: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  unset: { flex: 1, opacity: 0.5 },
  note: { fontSize: 12, opacity: 0.7, lineHeight: 1.5 },
});

// 地図データの範囲（scripts/build-pbf.sh と揃える）
const REGIONS = [
  "東京",
  "神奈川",
  "埼玉",
  "千葉",
  "茨城",
  "栃木",
  "群馬",
  "山梨",
  "静岡",
  "長野",
  "新潟",
];

export function Settings() {
  const home = useSaved((state) => state.home);
  const iconOnly = useSaved((state) => state.iconOnly);

  return (
    <div {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.header)}>
        <button
          {...stylex.props(button.base, button.icon)}
          onClick={tripActions.backPressed}
          aria-label="戻る"
        >
          ←
        </button>
        <h1 {...stylex.props(styles.title)}>設定</h1>
      </div>
      <div {...stylex.props(styles.row)}>
        <HomeIcon size={20} />
        {home ? (
          <span {...stylex.props(styles.name)}>{home.label}</span>
        ) : (
          <span {...stylex.props(styles.unset)}>未登録</span>
        )}
        <button {...stylex.props(button.base)} onClick={tripActions.homeSetupEntered}>
          {home ? "変更" : "自宅を設定"}
        </button>
      </div>
      <label {...stylex.props(styles.row)}>
        <input
          type="checkbox"
          checked={iconOnly}
          onChange={(event) => savedActions.iconOnlyToggled(event.target.checked)}
        />
        細い道・右左折をアイコンだけで表示
      </label>
      <p {...stylex.props(styles.note)}>対応地域: {REGIONS.join("・")}</p>
    </div>
  );
}
