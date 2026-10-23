import type { SavedPoint } from "@/model/point.ts";

const SEARCH = "https://map.yahooapis.jp/search/local/V1/localSearch";
const TIMEOUT = 10_000;
const RESULTS = 100; // API の上限

let sequence = 0;

/** 法人格略号を空白に。削除すると 0 件になる（ADR-0003） */
export function normalizePoiQuery(query: string): string {
  return query.replace(/[（(][株有][）)]/g, " ").trim();
}

type Response = {
  ResultInfo: { Status: number };
  Feature?: { Name: string; Geometry: { Coordinates: string } }[];
};

/**
 * Yahoo! ローカルサーチで施設名検索。API が CORS ヘッダを返さないため JSONP。
 * 最大 100 件（API 上限）。失敗（script error・10 秒・Status != 200・appid 未設定）は reject。abort は AbortError
 */
export async function searchPoi(query: string, signal: AbortSignal): Promise<SavedPoint[]> {
  const appid = import.meta.env.VITE_YAHOO_APPID as string | undefined;
  if (!appid) throw new Error("VITE_YAHOO_APPID is not set");
  signal.throwIfAborted();

  const callbackName = `__yj${++sequence}`;
  const windowRecord = window as unknown as Record<string, unknown>;
  const script = document.createElement("script");

  return new Promise<SavedPoint[]>((resolve, reject) => {
    // 決着（成功・失敗・中断）したら必ず後始末。どの経路も 1 回しか通らない
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      script.remove();
      delete windowRecord[callbackName];
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onAbort = () => fail(new DOMException("aborted", "AbortError"));
    const timer = setTimeout(() => fail(new Error("timeout")), TIMEOUT);

    signal.addEventListener("abort", onAbort);
    script.onerror = () => fail(new Error("script error"));

    windowRecord[callbackName] = (response: Response) => {
      if (response.ResultInfo.Status !== 200)
        return fail(new Error(`Status ${response.ResultInfo.Status}`));

      cleanup();
      resolve(
        (response.Feature ?? []).map((feature) => {
          const [lng = NaN, lat = NaN] = feature.Geometry.Coordinates.split(",").map(Number);
          return { label: feature.Name, lat, lng };
        }),
      );
    };

    const params = new URLSearchParams({
      appid,
      output: "json",
      results: String(RESULTS),
      query: normalizePoiQuery(query),
      callback: callbackName,
    });

    script.src = `${SEARCH}?${params}`;
    document.head.appendChild(script);
  });
}
