import { useEffect, useRef } from "react";

/**
 * standalone PWA は再表示時にページを再読込しないので自前で更新を検知する。
 * visible 復帰時に index.html を再取得（no-store）し、現在の bundle への参照が消えていれば reload。
 * blocked（ナビ中）なら保留し、解除時に reload する。dev・非ビルド環境では何もしない
 */
export function useUpdateCheck(blocked: boolean): void {
  const staleRef = useRef(false);
  const blockedRef = useRef(blocked);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    const scriptSource = document
      .querySelector<HTMLScriptElement>('script[type="module"]')
      ?.getAttribute("src");
    if (!scriptSource) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const html = await (await fetch("/", { cache: "no-store" })).text();
        staleRef.current = !html.includes(scriptSource);
      } catch {
        return; // オフライン等。次回 visible で再試行
      }
      if (staleRef.current && !blockedRef.current) location.reload();
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  useEffect(() => {
    blockedRef.current = blocked;
    if (!blocked && staleRef.current) location.reload();
  }, [blocked]);
}
