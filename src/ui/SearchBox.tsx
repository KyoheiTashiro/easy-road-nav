import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { searchAddress, type SearchHit } from "../api/gsi.ts";
import type { LatLng } from "../model/route.ts";
import { button } from "./button.stylex.ts";
import { colors } from "./tokens.stylex.ts";

const styles = stylex.create({
  box: {
    position: "fixed",
    top: "calc(env(safe-area-inset-top) + 12px)",
    left: 12,
    right: 12,
    zIndex: 5,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: { display: "flex", gap: 8 },
  inputWrap: { position: "relative", flex: 1 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 44,
    padding: "0 12px",
    appearance: "none",
    fontSize: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bg,
    color: colors.fg,
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  },
  source: { padding: "4px 12px 6px", fontSize: 10, opacity: 0.6, textAlign: "right" },
  current: {
    backgroundColor: colors.bg,
    color: colors.accent,
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 4,
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: 8,
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    maxHeight: "40vh",
    overflowY: "auto",
  },
});

type SearchBoxProps = {
  onSelect(p: LatLng, title: string): void; // 候補タップ → App が flyTo + ポップアップ
  onUseCurrent(): void; // 「現在地から」
  currentDisabled: boolean; // fix なし or GPS エラー
  onError(msg: string): void; // トースト
};

export function SearchBox({ onSelect, onUseCurrent, currentDisabled, onError }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  // 結果はクエリ付き。表示は現在のクエリと一致するものだけ（古い結果・短いクエリで空）
  const [result, setResult] = useState<{ q: string; hits: SearchHit[] } | null>(null);
  const q = query.trim();
  const hits = result?.q === q ? result.hits : [];

  // 2 文字以上で debounce 300 ms。前回リクエストは cleanup で中断
  useEffect(() => {
    if (q.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchAddress(q, ac.signal)
        .then((hits) => setResult({ q, hits }))
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          onError("住所検索に失敗しました");
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, onError]);

  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.inputWrap)}>
          <input
            {...stylex.props(styles.input)}
            type="search"
            placeholder="住所で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="住所検索"
          />
        </div>
        <button
          {...stylex.props(button.base, styles.current)}
          disabled={currentDisabled}
          onClick={onUseCurrent}
        >
          現在地から
        </button>
      </div>
      {hits.length > 0 && (
        <ul {...stylex.props(styles.list)}>
          {hits.map((h, i) => (
            <li key={i}>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => {
                  setQuery("");
                  onSelect({ lat: h.lat, lng: h.lng }, h.title);
                }}
              >
                {h.title}
              </button>
            </li>
          ))}
          <li {...stylex.props(styles.source)}>出典: 国土地理院</li>
        </ul>
      )}
    </div>
  );
}
