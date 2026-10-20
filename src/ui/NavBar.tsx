import * as stylex from "@stylexjs/stylex";
import { formatClock, formatDuration } from "@/model/format.ts";
import { remainingTime } from "@/model/progress.ts";
import { navActions, useNav } from "@/store/nav.ts";
import { selectRoute, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { colors } from "@/ui/tokens.stylex.ts";

/** 下部バーの高さ（px、safe area 除く）。Map のナビ時パディングに使う */
export const NAVBAR_HEIGHT = 64;

const styles = stylex.create({
  bar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: NAVBAR_HEIGHT,
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
  time: { fontSize: 18, fontWeight: 700 },
  eta: { fontSize: 13, opacity: 0.7 },
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
        {...stylex.props(button.base, muted && button.active)}
        onClick={navActions.toggleMute}
        aria-pressed={muted}
      >
        {muted ? "ミュート中" : "ミュート"}
      </button>
      <button {...stylex.props(button.base, button.danger)} onClick={() => navActions.end(true)}>
        終了
      </button>
    </div>
  );
}
