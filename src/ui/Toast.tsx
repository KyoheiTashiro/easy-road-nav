import * as stylex from "@stylexjs/stylex";
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
  // 88 = NavHud の HUD_HEIGHT。stylex.create 内では .stylex.* 以外の import 値を使えないため直書き
  nav: { top: "calc(env(safe-area-inset-top) + 104px)" },
});

/** 1 つだけ。消去タイマーは App（4 秒）。navMode で HUD の下に出す */
export function Toast({ message, navMode }: { message: string | null; navMode: boolean }) {
  if (!message) return null;
  return (
    <div role="status" {...stylex.props(styles.toast, navMode && styles.nav)}>
      {message}
    </div>
  );
}
