import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
import { clearToast, useToast } from "@/store/toast.ts";
import { MODE, useTrip } from "@/store/trip.ts";
import { layout } from "@/ui/layout.stylex.ts";
import { colors } from "@/ui/tokens.stylex.ts";

const styles = stylex.create({
  toast: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top) + 16px)",
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "90vw",
    padding: "10px 16px",
    borderRadius: 8,
    backgroundColor: colors.fg,
    color: colors.bg,
    fontSize: 14,
    boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  // defineConsts の値はコンパイル時に文字列で埋まるので JS で足さず calc に並べる
  nav: { top: `calc(env(safe-area-inset-top) + ${layout.hud}px + ${layout.next}px + 16px)` },
});

export function Toast() {
  const message = useToast();
  const navMode = useTrip((s) => s.mode === MODE.NAV);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clearToast, 4000);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <div role="status" {...stylex.props(styles.toast, navMode && styles.nav)}>
      {message}
    </div>
  );
}
