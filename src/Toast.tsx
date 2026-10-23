import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
import { clearToast, useToast } from "@/shared/toast.ts";
import { MODE, useTrip } from "@/trip/trip.ts";
import { layout } from "@/shared/layout.stylex.ts";
import { colors, shadows } from "@/shared/tokens.stylex.ts";

const styles = stylex.create({
  toast: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top) + 16px)",
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "90vw",
    paddingBlock: 10,
    paddingInline: 16,
    borderRadius: 8,
    backgroundColor: colors.foreground,
    color: colors.background,
    fontSize: 14,
    boxShadow: shadows.float,
    zIndex: 10,
  },
  // defineConsts の値はコンパイル時に文字列で埋まるので JS で足さず calc に並べる
  navigation: { top: `calc(env(safe-area-inset-top) + ${layout.hud}px + ${layout.next}px + 16px)` },
});

export function Toast() {
  const message = useToast((state) => state.message);
  const navigationMode = useTrip((state) => state.mode === MODE.NAVIGATION);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clearToast, 4000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div role="status" {...stylex.props(styles.toast, navigationMode && styles.navigation)}>
      {message}
    </div>
  );
}
