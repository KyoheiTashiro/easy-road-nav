import * as stylex from "@stylexjs/stylex";
import { formatClock, formatDuration } from "@/model/format.ts";
import { remainingTime } from "@/model/progress.ts";
import { navigationActions, useNavigation } from "@/store/navigation.ts";
import { selectRoute, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { VolumeIcon, VolumeOffIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors, shadows } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  bar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    // ホームインジケータ分を padding で空けると中身が上寄りに見えるので、高さに含めて全体で中央揃え
    height: `calc(${layout.navigationBar}px + env(safe-area-inset-bottom))`,
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 12,
    backgroundColor: colors.background,
    color: colors.foreground,
    boxShadow: shadows.up,
    zIndex: 5,
  },
  information: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  // 和文フォントの既定行高は大きく、上下の隙間が消える
  time: { fontSize: 24, fontWeight: 700, lineHeight: "30px" },
  eta: { fontSize: 16, opacity: 0.7, lineHeight: "20px" },
  mute: { width: 44, height: 44, display: "grid", placeItems: "center" },
  end: { height: 52, paddingBlock: 0, paddingInline: 20, fontSize: 16, marginLeft: 8 }, // 案内開始と同じ大きさ。ミュートとの間を bar の gap より広げる
});

export function NavigationBar() {
  const navigation = useNavigation((state) => state.navigation);
  const muted = useNavigation((state) => state.muted);
  const route = useTrip(selectRoute);
  const fix = useTrip((state) => state.fix);
  if (!navigation || !route || !fix) return null;
  const remainingMs = remainingTime(route, navigation.s);
  const arrivalAt = fix.timestamp + remainingMs; // 到着予想 epoch ms。render 内で Date.now を呼ばない
  return (
    <div {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.information)}>
        <span {...stylex.props(styles.time)}>{formatDuration(remainingMs)}</span>
        <span {...stylex.props(styles.eta)}>{formatClock(new Date(arrivalAt))} 到着予定</span>
      </div>
      {!navigation.follow && (
        <button
          {...stylex.props(button.base, button.active)}
          onClick={() => navigationActions.setFollow(true)}
        >
          現在地
        </button>
      )}
      <button
        {...stylex.props(button.base, button.icon, styles.mute, muted && button.active)}
        onClick={navigationActions.toggleMute}
        aria-pressed={muted}
        aria-label="ミュート"
      >
        {muted ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
      <button
        {...stylex.props(button.base, button.danger, styles.end)}
        onClick={() => navigationActions.end(true)}
      >
        終了
      </button>
    </div>
  );
}
