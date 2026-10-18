import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { searchAddress, type SearchHit } from "../api/gsi.ts";
import { searchPoi } from "../api/yahoo.ts";
import type { Fix, LatLng, Point, SavedPoint } from "../model/route.ts";
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
  back: { marginRight: 4 },
  sub: { marginLeft: 8, fontSize: 13, opacity: 0.6 },
  source: { padding: "4px 12px 6px", fontSize: 10, opacity: 0.6, textAlign: "right" },
  credit: { padding: "4px 12px 6px", textAlign: "right" }, // Yahoo のスニペットは色・サイズを変えない
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

type Role = "from" | "to" | "home";
type Source = "gsi" | "yahoo";

type SearchBoxProps = {
  mode: "edit" | "home"; // edit = 出発地 / 到着地の 2 欄、home = 「戻る」+ 自宅欄 1 つ
  from: Point | null;
  to: Point | null;
  fix: Fix | null; // 候補「現在地」の表示条件
  home: SavedPoint | null; // 空欄候補「自宅」（home モードでは出さない）
  history: SavedPoint[]; // 空欄候補（新しい順）
  onSet(role: Role, p: LatLng, label: string | null): void; // label null = 逆ジオへ
  onPick(p: SavedPoint): void; // 住所 / 施設名の候補タップ（履歴に追加）。onSet の直前
  onClear(role: "from" | "to"): void;
  onBack(): void; // home モードの「戻る」
  onError(msg: string): void; // トースト
};

export function SearchBox(props: SearchBoxProps) {
  const { mode, from, to, fix, home, history, onSet, onPick, onClear, onBack, onError } = props;
  const [active, setActive] = useState<Role | null>(null); // フォーカス中の欄
  const [query, setQuery] = useState("");
  // 結果はクエリ付き。表示は現在のクエリと一致するものだけ（古い結果・短いクエリで空）
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; source: Source } | null>(
    null,
  );
  const [poiQ, setPoiQ] = useState<string | null>(null); // Enter 確定したクエリ。q と一致する間だけ施設検索
  const q = query.trim();
  const hits = active && result?.q === q ? result.hits : [];
  const showCurrent = (active === "from" || active === "home") && !!fix;
  // 入力が空のときだけ出す固定候補: 自宅（edit のみ）→ 履歴
  const empty = !!active && q === "";
  const showHome = empty && active !== "home" && home;
  const saved = empty ? history : [];
  // 入力中は末尾に「"q" を施設名で検索」行を常時出す（Enter と同じ）。施設検索を実行済みのクエリでは出さない
  const showPoiRow = !!active && q !== "" && poiQ !== q;
  const showList =
    !!active && (showCurrent || !!showHome || saved.length > 0 || hits.length > 0 || showPoiRow);

  // Enter 確定 → 施設検索（Yahoo! ローカルサーチ）。それ以外は 2 文字以上で debounce 300 ms の住所検索。
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
          setResult({ q, hits, source: "yahoo" });
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
        {role === "home" ? (
          <button
            {...stylex.props(button.base, button.icon, styles.back)}
            onClick={onBack}
            aria-label="戻る"
          >
            ←
          </button>
        ) : (
          <span {...stylex.props(styles.role)}>
            <PointIcon role={role} size={20} />
          </span>
        )}
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
          {!focused && point && role !== "home" && (
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
        {mode === "home" ? (
          field("home", null, "自宅")
        ) : (
          <>
            {field("from", from, "出発地")}
            {field("to", to, "到着地")}
          </>
        )}
      </div>
      {showList && (
        <ul {...stylex.props(styles.list)}>
          {showCurrent && (
            <li>
              <button
                {...stylex.props(button.base, button.ghost, styles.current)}
                onClick={() => pick(active, { lat: fix.lat, lng: fix.lng }, null)}
              >
                現在地
              </button>
            </li>
          )}
          {showHome && (
            <li>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => pick(active, home, home.label)}
              >
                自宅<span {...stylex.props(styles.sub)}>{home.label}</span>
              </button>
            </li>
          )}
          {saved.map((h, i) => (
            <li key={i}>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => pick(active, h, h.label)}
              >
                {h.label}
              </button>
            </li>
          ))}
          {hits.map((h, i) => (
            <li key={i}>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => {
                  onPick({ lat: h.lat, lng: h.lng, label: h.title });
                  pick(active, { lat: h.lat, lng: h.lng }, h.title);
                }}
              >
                {h.title}
              </button>
            </li>
          ))}
          {showPoiRow && (
            <li>
              <button
                {...stylex.props(button.base, button.ghost, styles.current)}
                // 入力欄の blur（→ リスト非表示）を防ぐ
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setPoiQ(q)}
              >
                🔍 「{q}」で検索
              </button>
            </li>
          )}
          {hits.length > 0 &&
            (result!.source === "gsi" ? (
              <li {...stylex.props(styles.source)}>出典: 国土地理院</li>
            ) : (
              <li {...stylex.props(styles.credit)}>
                <a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
