import * as stylex from "@stylexjs/stylex";
import { formatClock, formatDuration } from "@/model/format.ts";
import { remainingTime } from "@/model/progress.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { selectRoute, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { VolumeIcon, VolumeOffIcon } from "@/ui/icons/index.tsx";
import { layout } from "@/ui/layout.stylex.ts";
import { colors } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  bar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: `${layout.navbar}px`,
    paddingBottom: "env(safe-area-inset-bottom)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 12,
    backgroundColor: colors.bg,
    color: colors.fg,
    boxShadow: "0 -2px 8px rgba(0,0,0,0.25)",
    zIndex: 5,
  },
  info: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  time: { fontSize: 24, fontWeight: 700 },
  eta: { fontSize: 16, opacity: 0.7 },
  mute: { width: 44, height: 44, display: "grid", placeItems: "center" },
  end: { height: 52, padding: "0 20px", fontSize: 16, marginLeft: 8 }, // 案内開始と同じ大きさ。ミュートとの間を bar の gap より広げる
});

export function NavBar() {
  const nav = useNav((s) => s.nav);
  const muted = useNav((s) => s.muted);
  const route = useTrip(selectRoute);
  const fix = useTrip((s) => s.fix);
  if (!nav || !route || !fix) return null;
  const remainingMs = remainingTime(route, nav.s);
  const arrivalAt = fix.t + remainingMs; // 到着予想 epoch ms。render 内で Date.now を呼ばない
  return (
    <div {...stylex.props(styles.bar)}>
      <div {...stylex.props(styles.info)}>
        <span {...stylex.props(styles.time)}>{formatDuration(remainingMs)}</span>
        <span {...stylex.props(styles.eta)}>{formatClock(new Date(arrivalAt))} 到着予定</span>
      </div>
      {!nav.follow && (
        <button
          {...stylex.props(button.base, button.active)}
          onClick={() => navActions.setFollow(true)}
        >
          現在地
        </button>
      )}
      <button
        {...stylex.props(button.base, button.icon, styles.mute, muted && button.active)}
        onClick={navActions.toggleMute}
        aria-pressed={muted}
        aria-label="ミュート"
      >
        {muted ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
      <button
        {...stylex.props(button.base, button.danger, styles.end)}
        onClick={() => navActions.end(true)}
      >
        終了
      </button>
    </div>
  );
}
