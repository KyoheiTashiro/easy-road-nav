import * as stylex from "@stylexjs/stylex";
import { useRef, useState, type ReactNode } from "react";
import { searchAddress } from "@/api/gsi.ts";
import { searchPoi } from "@/api/yahoo.ts";
import { ROLE, type LatLng, type PickRole, type Point, type SavedPoint } from "@/model/point.ts";
import { savedActions, useSaved } from "@/store/saved.ts";
import { showToast } from "@/store/toast.ts";
import { MODE, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { FromIcon, HomeIcon, ToIcon } from "@/ui/icons/index.tsx";
import { colors } from "@/ui/tokens.stylex.ts";

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
  home: { display: "flex", alignItems: "center", gap: 8 },
  // 出典行。Yahoo のクレジットは色・サイズを変えられない（ガイドライン）ので国土地理院側も同じ見た目に揃える
  credit: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 4,
    padding: "8px 12px 6px",
  },
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

type Result = { q: string; hits: SavedPoint[] }; // 結果はクエリ付き。現在のクエリと一致するものだけ表示

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export function SearchBox() {
  const mode = useTrip((s) => (s.mode === MODE.HOME ? MODE.HOME : MODE.EDIT));
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const fix = useTrip((s) => (s.gpsError ? null : s.fix));
  const home = useSaved((s) => s.home);
  const history = useSaved((s) => s.history);
  const [active, setActive] = useState<PickRole | null>(null);
  const [query, setQuery] = useState("");
  const [gsi, setGsi] = useState<Result | null>(null);
  const [poi, setPoi] = useState<Result | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const q = query.trim();
  const inflight = useRef<AbortController | null>(null);

  function search() {
    if (!q) return;
    setSearched(q);
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    searchAddress(q, ac.signal)
      .then((hits) => setGsi({ q, hits }))
      .catch((e) => {
        if (!isAbort(e)) showToast("住所検索に失敗しました");
      });
    searchPoi(q, ac.signal)
      .then((hits) => setPoi({ q, hits }))
      .catch((e) => {
        if (!isAbort(e)) showToast("施設検索に失敗しました");
      });
  }

  function pick(role: PickRole, p: LatLng, label: string | null) {
    setQuery("");
    setSearched(null);
    setActive(null);
    tripActions.searchPicked(role, p, label);
  }

  function field(role: PickRole, point: Point | null, name: string, icon: ReactNode) {
    const focused = active === role;
    const shown = point ? (point.label ?? "…") : ""; // label null = 逆ジオ待ち
    return (
      <form
        {...stylex.props(styles.row, role === ROLE.TO && styles.divider)}
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        {role === ROLE.HOME ? (
          <button
            {...stylex.props(button.base, button.icon, styles.back)}
            onClick={tripActions.editReturned}
            aria-label="戻る"
          >
            ←
          </button>
        ) : (
          <span {...stylex.props(styles.role)}>{icon}</span>
        )}
        <div {...stylex.props(styles.inputWrap)}>
          <input
            {...stylex.props(styles.input)}
            type="search"
            enterKeyHint="search"
            placeholder={`${name}を検索`}
            value={focused ? query : shown}
            onFocus={() => {
              setActive(role);
              setQuery("");
              setSearched(null);
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
          {!focused && point && role !== ROLE.HOME && (
            <button
              {...stylex.props(button.base, button.icon, styles.clear)}
              onClick={() => tripActions.pointDeleted(role)}
              aria-label={`${name}を削除`}
            >
              ×
            </button>
          )}
        </div>
      </form>
    );
  }

  const rows: ReactNode[] = [];
  if (active) {
    const row = (key: string, node: ReactNode) => rows.push(<li key={key}>{node}</li>);
    if ((active === ROLE.FROM || active === ROLE.HOME) && fix) {
      row(
        "current",
        <button
          {...stylex.props(button.base, button.ghost, styles.current)}
          onClick={() => pick(active, { lat: fix.lat, lng: fix.lng }, null)}
        >
          現在地
        </button>,
      );
    }
    if (q === "") {
      if (active !== ROLE.HOME && home) {
        row(
          "home",
          <button
            {...stylex.props(button.base, button.ghost, styles.home)}
            onClick={() => pick(active, home, home.label)}
          >
            <HomeIcon size={20} />
            自宅<span {...stylex.props(styles.sub)}>{home.label}</span>
          </button>,
        );
      }
      history.forEach((h, i) =>
        row(
          `history-${i}`,
          <button
            {...stylex.props(button.base, button.ghost)}
            onClick={() => pick(active, h, h.label)}
          >
            {h.label}
          </button>,
        ),
      );
    } else if (searched !== q) {
      row(
        "search",
        <button
          {...stylex.props(button.base, button.ghost)}
          // 入力欄の blur（→ リスト非表示）を防ぐ
          onMouseDown={(e) => e.preventDefault()}
          onClick={search}
        >
          🔍 「{q}」で検索
        </button>,
      );
    }
    const gsiHits = gsi?.q === q ? gsi.hits : [];
    const poiHits = poi?.q === q ? poi.hits : [];
    [...poiHits, ...gsiHits].forEach((h, i) =>
      row(
        `hit-${i}`,
        <button
          {...stylex.props(button.base, button.ghost)}
          onClick={() => {
            savedActions.historyPushed(h); // 住所 / 施設名の候補だけ履歴に残す
            pick(active, { lat: h.lat, lng: h.lng }, h.label);
          }}
        >
          {h.label}
        </button>,
      ),
    );
    if (gsiHits.length > 0 || poiHits.length > 0) {
      rows.push(
        <li key="credit" {...stylex.props(styles.divider, styles.credit)}>
          {gsiHits.length > 0 && <a href="https://www.gsi.go.jp/">出典: 国土地理院</a>}
          {poiHits.length > 0 && (
            <a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a>
          )}
        </li>,
      );
    }
  }

  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.card)}>
        {mode === MODE.HOME ? (
          field(ROLE.HOME, null, "自宅", null)
        ) : (
          <>
            {field(ROLE.FROM, from, "出発地", <FromIcon size={20} />)}
            {field(ROLE.TO, to, "到着地", <ToIcon size={20} />)}
          </>
        )}
      </div>
      {rows.length > 0 && <ul {...stylex.props(styles.list)}>{rows}</ul>}
    </div>
  );
}
