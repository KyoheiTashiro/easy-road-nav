import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
import { clearToast, useToast } from "../store/toast.ts";
import { useTrip } from "../store/trip.ts";
import { colors } from "./tokens.stylex.ts";

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
  // 120 = NavHud の HUD_HEIGHT + NEXT_HEIGHT。stylex.create 内では .stylex.* 以外の import 値を使えないため直書き
  nav: { top: "calc(env(safe-area-inset-top) + 136px)" },
});

/** 1 つだけ。4 秒で消去。ナビ中は HUD の下に出す */
export function Toast() {
  const message = useToast();
  const navMode = useTrip((s) => s.mode === "nav");
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
