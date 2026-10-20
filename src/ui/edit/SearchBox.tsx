import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";
import { searchAddress } from "@/api/gsi.ts";
import { searchPoi } from "@/api/yahoo.ts";
import { ROLE, type LatLng, type PickRole, type Point, type SavedPoint } from "@/model/point.ts";
import { savedActions, useSaved } from "@/store/saved.ts";
import { showToast } from "@/store/toast.ts";
import { MODE, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { PointIcon } from "@/ui/icons.tsx";
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

const skipAbort = (e: unknown) => {
  if (e instanceof DOMException && e.name === "AbortError") return;
  throw e;
};

/** edit = 出発地 / 到着地の 2 欄、home = 「戻る」+ 自宅欄 1 つ。App が key={mode} で入力 state を捨てる */
export function SearchBox() {
  const mode = useTrip((s) => (s.mode === MODE.HOME ? MODE.HOME : MODE.EDIT));
  const from = useTrip((s) => s.from);
  const to = useTrip((s) => s.to);
  const fix = useTrip((s) => (s.gpsError ? null : s.fix)); // 候補「現在地」の表示条件
  const home = useSaved((s) => s.home); // 空欄候補「自宅」（home モードでは出さない）
  const history = useSaved((s) => s.history); // 空欄候補（新しい順）
  const [active, setActive] = useState<PickRole | null>(null); // フォーカス中の欄
  const [query, setQuery] = useState("");
  const [gsi, setGsi] = useState<Result | null>(null); // 住所検索
  const [poi, setPoi] = useState<Result | null>(null); // 施設名検索
  const [searched, setSearched] = useState<string | null>(null); // 最後に検索したクエリ。未検索なら「🔍 で検索」行を出す
  const q = query.trim();
  const gsiHits = active && gsi?.q === q ? gsi.hits : [];
  const poiHits = active && poi?.q === q ? poi.hits : [];
  const showCurrent = (active === ROLE.FROM || active === ROLE.HOME) && !!fix;
  // 入力が空のときだけ出す固定候補: 自宅（edit のみ）→ 履歴
  const empty = !!active && q === "";
  const showHome = empty && active !== ROLE.HOME && home;
  const saved = empty ? history : [];
  const showSearchRow = !!active && q !== "" && searched !== q;
  const showList =
    !!active &&
    (showCurrent ||
      !!showHome ||
      saved.length > 0 ||
      showSearchRow ||
      gsiHits.length > 0 ||
      poiHits.length > 0);

  const inflight = useRef<AbortController | null>(null);

  // Enter（スマホの「検索」キー）か「🔍 で検索」行で住所検索と施設名検索を 1 回ずつ並行して呼ぶ。前回の飛行中リクエストは中断
  function search() {
    if (!q) return;
    setSearched(q);
    inflight.current?.abort();
    const ac = (inflight.current = new AbortController());
    searchAddress(q, ac.signal)
      .then((hits) => setGsi({ q, hits }))
      .catch(skipAbort)
      .catch(() => showToast("住所検索に失敗しました"));
    searchPoi(q, ac.signal)
      .then((hits) => setPoi({ q, hits }))
      .catch(skipAbort)
      .catch(() => showToast("施設検索に失敗しました"));
  }

  // label null = 逆ジオへ
  function pick(role: PickRole, p: LatLng, label: string | null) {
    setQuery("");
    setSearched(null);
    setActive(null);
    tripActions.searchPicked(role, p, label);
  }

  function field(role: PickRole, point: Point | null, name: string) {
    const focused = active === role;
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

  return (
    <div {...stylex.props(styles.box)}>
      <div {...stylex.props(styles.card)}>
        {mode === MODE.HOME ? (
          field(ROLE.HOME, null, "自宅")
        ) : (
          <>
            {field(ROLE.FROM, from, "出発地")}
            {field(ROLE.TO, to, "到着地")}
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
          {showSearchRow && (
            <li>
              <button
                {...stylex.props(button.base, button.ghost, styles.current)}
                // 入力欄の blur（→ リスト非表示）を防ぐ
                onMouseDown={(e) => e.preventDefault()}
                onClick={search}
              >
                🔍 「{q}」で検索
              </button>
            </li>
          )}
          {[...poiHits, ...gsiHits].map((h, i) => (
            <li key={i}>
              <button
                {...stylex.props(button.base, button.ghost)}
                onClick={() => {
                  savedActions.historyPushed(h); // 住所 / 施設名の候補だけ履歴に残す
                  pick(active, { lat: h.lat, lng: h.lng }, h.label);
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
          {(gsiHits.length > 0 || poiHits.length > 0) && (
            <li {...stylex.props(styles.divider, styles.credit)}>
              {gsiHits.length > 0 && <a href="https://www.gsi.go.jp/">出典: 国土地理院</a>}
              {poiHits.length > 0 && (
                <a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
