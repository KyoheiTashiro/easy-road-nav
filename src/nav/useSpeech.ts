import { useEffect, useMemo, useRef } from "react";

/**
 * speechSynthesis の薄いラッパ。キューはブラウザ内蔵のものを使う（speak は順に再生される）。
 * - muted: speak を捨てる。ON にした時点で再生中・待機中を cancel
 * - 同一文字列: まだ再生・待機中の直前文字列と同じなら捨てる（再生し終えた後の再発話は許す）
 * - unlock: iOS Safari はユーザー操作内の speak が必要。「案内開始」の click 内で空発話する
 */
export function useSpeech(muted: boolean): {
  speak(text: string): void;
  cancel(): void;
  unlock(): void;
} {
  const mutedRef = useRef(muted);
  const last = useRef<string | null>(null);
  const ok = typeof speechSynthesis !== "undefined";

  useEffect(() => {
    mutedRef.current = muted;
    if (muted && ok) {
      speechSynthesis.cancel();
      last.current = null;
    }
  }, [muted, ok]);

  return useMemo(
    () => ({
      speak(text: string) {
        if (!ok || mutedRef.current || text === last.current) return;
        last.current = text;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.rate = 1;
        u.onend = u.onerror = () => {
          if (last.current === text) last.current = null;
        };
        speechSynthesis.speak(u);
      },
      cancel() {
        last.current = null;
        if (ok) speechSynthesis.cancel();
      },
      unlock() {
        if (ok) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
      },
    }),
    [ok],
  );
}
