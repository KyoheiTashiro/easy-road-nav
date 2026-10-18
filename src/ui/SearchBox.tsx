import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { searchAddress, type SearchHit } from "../api/gsi.ts";
import { searchPoi } from "../api/nominatim.ts";
import type { Fix, LatLng, Point } from "../model/route.ts";
import { button } from "./button.stylex.ts";
import { PointIcon } from "./icons.tsx";
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
  card: {
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
  },
  row: { display: "flex", alignItems: "center", height: 44, padding: "0 8px" },
  divider: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: colors.border },
  role: { width: 32, display: "flex", justifyContent: "center", flexShrink: 0 },
  inputWrap: { position: "relative", flex: 1 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 44,
    padding: "0 36px 0 4px",
    appearance: "none",
    fontSize: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.fg,
  },
  clear: {
    position: "absolute",
    right: 4,
    top: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.fg,
    fontSize: 18,
  },
  source: { padding: "4px 12px 6px", fontSize: 10, opacity: 0.6, textAlign: "right" },
  current: { color: colors.accent },
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

type Role = "from" | "to";
type Source = "gsi" | "osm";
const SOURCE: Record<Source, string> = {
  gsi: "出典: 国土地理院",
  osm: "© OpenStreetMap contributors",
};

type SearchBoxProps = {
  from: Point | null;
  to: Point | null;
  fix: Fix | null; // 出発地候補「現在地」の表示条件
  onSet(role: Role, p: LatLng, label: string | null): void; // label null = 逆ジオへ
  onClear(role: Role): void;
  onError(msg: string): void; // トースト
};

export function SearchBox({ from, to, fix, onSet, onClear, onError }: SearchBoxProps) {
  const [active, setActive] = useState<Role | null>(null); // フォーカス中の欄
  const [query, setQuery] = useState("");
  // 結果はクエリ付き。表示は現在のクエリと一致するものだけ（古い結果・短いクエリで空）
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; source: Source } | null>(
    null,
  );
  const [poiQ, setPoiQ] = useState<string | null>(null); // Enter 確定したクエリ。q と一致する間だけ施設検索
  const q = query.trim();
  const hits = active && result?.q === q ? result.hits : [];
  const showCurrent = active === "from" && !!fix;

  // Enter 確定 → 施設検索（Nominatim、規約でオートコンプリート不可）。それ以外は 2 文字以上で debounce 300 ms の住所検索。
  // q が変わると cleanup で前回リクエストを中断し、施設検索結果は住所検索で置き換わる
  useEffect(() => {
    const ac = new AbortController();
    const skipAbort = (e: unknown) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      throw e;
    };
    if (poiQ === q) {
      searchPoi(q, ac.signal)
        .then((hits) => {
          setResult({ q, hits, source: "osm" });
          if (hits.length === 0) onError("施設が見つかりません");
        })
        .catch(skipAbort)
        .catch(() => onError("施設検索に失敗しました"));
      return () => ac.abort();
    }
    if (q.length < 2) return;
    const t = setTimeout(() => {
      searchAddress(q, ac.signal)
        .then((hits) => setResult({ q, hits, source: "gsi" }))
        .catch(skipAbort)
        .catch(() => onError("住所検索に失敗しました"));
    }, 300);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, poiQ, onError]);

  function pick(role: Role, p: LatLng, label: string | null) {
    setQuery("");
    setActive(null);
    onSet(role, p, label);
  }

  function field(role: Role, point: Point | null, name: string) {
    const focused = active === role;
    return (
      <div {...stylex.props(styles.row, role === "to" && styles.divider)}>
        <span {...stylex.props(styles.role)}>
          <PointIcon role={role} size={20} />
        </span>
        <div {...stylex.props(styles.inputWrap)}>
          <input
            {...stylex.props(styles.input)}
            type="search"
            enterKeyHint="search"
            placeholder={`${name}を検索`}
            value={focused ? query : (point && (point.label ?? "…")) || ""}
            onFocus={() => {
              setActive(role);
              setQuery("");
              setPoiQ(null);
            }}
            // 候補タップ（mousedown）より後に blur が来るので遅延。pick 済みなら active は既に null
            onBlur={() => setTimeout(() => setActive((a) => (a === role ? null : a)), 150)}
            onChange={(e) => setQuery(e.target.value)}
            // IME 変換確定の Enter（isComposing）は無視
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && q) setPoiQ(q);
            }}
            aria-label={name}
          />
          {!focused && point && (
            <button
              {...stylex.props(button.base, button.icon, styles.clear)}
              onClick={() => onClear(role)}
              aria-label={`${name}を削除`}
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.card)}>
        {field("from", from, "出発地")}
        {field("to", to, "到着地")}
      </div>
      {active && (showCurrent || hits.length > 0) && (
        <ul {...stylex.props(styles.list)}>
          {showCurrent && (
            <li>
              <button
                {...stylex.props(button.base, button.ghost, styles.current)}
                onClick={() => pick("from", { lat: fix.lat, lng: fix.lng }, null)}
              >
                現在地
              </button>
            </li>
          )}
          {hits.map((h, i) => (
            <li key={i}>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => pick(active, { lat: h.lat, lng: h.lng }, h.title)}
              >
                {h.title}
              </button>
            </li>
          ))}
          {hits.length > 0 && <li {...stylex.props(styles.source)}>{SOURCE[result!.source]}</li>}
        </ul>
      )}
    </div>
  );
}
