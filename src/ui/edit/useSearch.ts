import { useRef, useState } from "react";
import { searchAddress } from "@/api/gsi.ts";
import { isAbortError } from "@/api/timeout.ts";
import { searchPoi } from "@/api/yahoo.ts";
import type { SavedPoint } from "@/model/point.ts";
import { showToast } from "@/store/toast.ts";

type Result = { query: string; hits: SavedPoint[] }; // 結果はクエリ付き。現在のクエリと一致するものだけ表示

/** 住所と施設名を並行検索する。新しい検索は前の検索を中断する */
export function useSearch(query: string) {
  const [gsi, setGsi] = useState<Result | null>(null);
  const [poi, setPoi] = useState<Result | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);

  function search() {
    if (!query) return;

    setSearched(query);
    inflight.current?.abort();
    const abortController = new AbortController();
    inflight.current = abortController;

    searchAddress(query, abortController.signal)
      .then((hits) => setGsi({ query, hits }))
      .catch((error) => {
        if (!isAbortError(error)) showToast("住所検索に失敗しました");
      });

    searchPoi(query, abortController.signal)
      .then((hits) => setPoi({ query, hits }))
      .catch((error) => {
        if (!isAbortError(error)) showToast("施設検索に失敗しました");
      });
  }

  return {
    search,
    searched,
    reset: () => setSearched(null),
    gsiHits: gsi?.query === query ? gsi.hits : [],
    poiHits: poi?.query === query ? poi.hits : [],
  };
}
