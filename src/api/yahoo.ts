import type { SearchHit } from "./gsi.ts";

const SEARCH = "https://map.yahooapis.jp/search/local/V1/localSearch";
const TIMEOUT = 10_000;

let seq = 0;

/** 法人格略号を空白に。削除すると 0 件になる（ADR-0003） */
export function normalizePoiQuery(q: string): string {
  return q.replace(/[（(][株有][）)]/g, " ").trim();
}

type Response = {
  ResultInfo: { Status: number };
  Feature?: { Name: string; Geometry: { Coordinates: string } }[];
};

/**
 * Yahoo! ローカルサーチで施設名検索。API が CORS ヘッダを返さないため JSONP。
 * 先頭 5 件。失敗（script error・10 秒・Status != 200・appid 未設定）は reject。abort は AbortError
 */
export async function searchPoi(q: string, signal: AbortSignal): Promise<SearchHit[]> {
  const appid = import.meta.env.VITE_YAHOO_APPID as string | undefined;
  if (!appid) throw new Error("VITE_YAHOO_APPID is not set");
  signal.throwIfAborted();
  const cb = `__yj${++seq}`;
  const w = window as unknown as Record<string, unknown>;
  const script = document.createElement("script");
  return new Promise<SearchHit[]>((resolve, reject) => {
    const done = (f: () => void) => () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      script.remove();
      delete w[cb];
      f();
    };
    const onAbort = done(() => reject(new DOMException("aborted", "AbortError")));
    const timer = setTimeout(
      done(() => reject(new Error("timeout"))),
      TIMEOUT,
    );
    signal.addEventListener("abort", onAbort);
    script.onerror = done(() => reject(new Error("script error")));
    w[cb] = (res: Response) =>
      done(() => {
        if (res.ResultInfo.Status !== 200)
          return reject(new Error(`Status ${res.ResultInfo.Status}`));
        resolve(
          (res.Feature ?? []).map((f) => {
            const [lng = NaN, lat = NaN] = f.Geometry.Coordinates.split(",").map(Number);
            return { title: f.Name, lat, lng };
          }),
        );
      })();
    const params = new URLSearchParams({
      appid,
      output: "json",
      results: "5",
      query: normalizePoiQuery(q),
      callback: cb,
    });
    script.src = `${SEARCH}?${params}`;
    document.head.appendChild(script);
  });
}
