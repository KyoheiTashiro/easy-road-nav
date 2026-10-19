import * as stylex from "@stylexjs/stylex";
import { type FormEvent, useRef, useState } from "react";
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
type Result = { q: string; hits: SearchHit[] }; // 結果はクエリ付き。現在のクエリと一致するものだけ表示

const skipAbort = (e: unknown) => {
  if (e instanceof DOMException && e.name === "AbortError") return;
  throw e;
};

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
  const [gsi, setGsi] = useState<Result | null>(null); // 住所検索
  const [poi, setPoi] = useState<Result | null>(null); // 施設名検索
  const q = query.trim();
  const gsiHits = active && gsi?.q === q ? gsi.hits : [];
  const poiHits = active && poi?.q === q ? poi.hits : [];
  const showCurrent = (active === "from" || active === "home") && !!fix;
  // 入力が空のときだけ出す固定候補: 自宅（edit のみ）→ 履歴
  const empty = !!active && q === "";
  const showHome = empty && active !== "home" && home;
  const saved = empty ? history : [];
  const showList =
    !!active &&
    (showCurrent || !!showHome || saved.length > 0 || gsiHits.length > 0 || poiHits.length > 0);

  const inflight = useRef<AbortController | null>(null);

  // Enter（スマホの「検索」キー）で住所検索と施設名検索を 1 回ずつ並行して呼ぶ。前回の飛行中リクエストは中断
  function search(e: FormEvent) {
    e.preventDefault();
    if (!q) return;
    inflight.current?.abort();
    const ac = (inflight.current = new AbortController());
    searchAddress(q, ac.signal)
      .then((hits) => setGsi({ q, hits }))
      .catch(skipAbort)
      .catch(() => onError("住所検索に失敗しました"));
    searchPoi(q, ac.signal)
      .then((hits) => setPoi({ q, hits }))
      .catch(skipAbort)
      .catch(() => onError("施設検索に失敗しました"));
  }

  function pick(role: Role, p: LatLng, label: string | null) {
    setQuery("");
    setActive(null);
    onSet(role, p, label);
  }

  function field(role: Role, point: Point | null, name: string) {
    const focused = active === role;
    return (
      <form {...stylex.props(styles.row, role === "to" && styles.divider)} onSubmit={search}>
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
            }}
            // 候補タップ（mousedown）より後に blur が来るので遅延。pick 済みなら active は既に null
            onBlur={() => setTimeout(() => setActive((a) => (a === role ? null : a)), 150)}
            onChange={(e) => setQuery(e.target.value)}
            // IME 変換確定の Enter で submit しない（Safari は isComposing が false なので keyCode 229 も見る）
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229))
                e.preventDefault();
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
      </form>
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
          {[...poiHits, ...gsiHits].map((h, i) => (
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
          {poiHits.length > 0 && (
            <li {...stylex.props(styles.credit)}>
              <a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a>
            </li>
          )}
          {gsiHits.length > 0 && <li {...stylex.props(styles.source)}>出典: 国土地理院</li>}
        </ul>
      )}
    </div>
  );
}
