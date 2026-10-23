import * as stylex from "@stylexjs/stylex";
import { useState, type ReactNode } from "react";
import { ROLE, type LatLng, type PickRole, type Point } from "@/model/point.ts";
import { savedActions, useSaved } from "@/store/saved.ts";
import { MODE, tripActions, useTrip } from "@/store/trip.ts";
import { button } from "@/ui/button.stylex.ts";
import { useSearch } from "@/ui/edit/useSearch.ts";
import { FromIcon, HomeIcon, SettingsIcon, ToIcon } from "@/ui/icons/index.tsx";
import { colors, shadows } from "@/ui/tokens.stylex.ts";

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
    backgroundColor: colors.background,
    color: colors.foreground,
    borderRadius: 12,
    boxShadow: shadows.card,
  },
  // カード下の丸ボタン。コンパス（右 10px・40px）と縦に揃える
  gear: {
    alignSelf: "flex-end",
    marginRight: -2,
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    borderRadius: "50%",
    backgroundColor: colors.background,
    color: colors.foreground,
    boxShadow: shadows.card,
    cursor: "pointer",
  },
  row: { display: "flex", alignItems: "center", height: 44, paddingBlock: 0, paddingInline: 8 },
  divider: { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: colors.border },
  role: { width: 32, display: "flex", justifyContent: "center", flexShrink: 0 },
  inputWrapper: { position: "relative", flex: 1 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    height: 44,
    paddingTop: 0,
    paddingRight: 36,
    paddingBottom: 0,
    paddingLeft: 4,
    appearance: "none",
    fontSize: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.foreground,
  },
  clear: {
    position: "absolute",
    right: 4,
    top: 4,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.foreground,
    fontSize: 18,
  },
  back: { marginRight: 4 },
  secondary: { marginLeft: 8, fontSize: 13, opacity: 0.6 },
  home: { display: "flex", alignItems: "center", gap: 8 },
  // 出典行。Yahoo のクレジットは色・サイズを変えられない（ガイドライン）ので国土地理院側も同じ見た目に揃える
  credit: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    marginTop: 4,
    paddingTop: 8,
    paddingInline: 12,
    paddingBottom: 6,
  },
  current: { color: colors.accent },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 4,
    backgroundColor: colors.background,
    color: colors.foreground,
    borderRadius: 8,
    boxShadow: shadows.float,
    maxHeight: "40vh",
    overflowY: "auto",
  },
});

export function SearchBox() {
  const mode = useTrip((state) => (state.mode === MODE.HOME_SETUP ? MODE.HOME_SETUP : MODE.EDIT));
  const from = useTrip((state) => state.from);
  const to = useTrip((state) => state.to);
  const fix = useTrip((state) => (state.gpsError ? null : state.fix));
  const home = useSaved((state) => state.home);
  const history = useSaved((state) => state.history);
  const [active, setActive] = useState<PickRole | null>(null);
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const { search, searched, reset, gsiHits, poiHits } = useSearch(trimmedQuery);

  function pick(role: PickRole, point: LatLng, label: string | null) {
    setQuery("");
    reset();
    setActive(null);
    tripActions.searchPicked(role, point, label);
  }

  function field(role: PickRole, point: Point | null, name: string, icon: ReactNode) {
    const focused = active === role;
    const shown = point ? (point.label ?? "…") : ""; // label null = 逆ジオ待ち
    return (
      <form
        {...stylex.props(styles.row, role === ROLE.TO && styles.divider)}
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        {role === ROLE.HOME ? (
          <button
            {...stylex.props(button.base, button.icon, styles.back)}
            onClick={tripActions.backPressed}
            aria-label="戻る"
          >
            ←
          </button>
        ) : (
          <span {...stylex.props(styles.role)}>{icon}</span>
        )}
        <div {...stylex.props(styles.inputWrapper)}>
          <input
            {...stylex.props(styles.input)}
            type="search"
            enterKeyHint="search"
            placeholder={`${name}を検索`}
            value={focused ? query : shown}
            onFocus={() => {
              setActive(role);
              setQuery("");
              reset();
            }}
            // 候補タップ（mousedown）より後に blur が来るので遅延。pick 済みなら active は既に null
            onBlur={() =>
              setTimeout(() => setActive((current) => (current === role ? null : current)), 150)
            }
            onChange={(event) => setQuery(event.target.value)}
            // IME 変換確定の Enter で submit しない（Safari は isComposing が false なので keyCode 229 も見る）
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229))
                event.preventDefault();
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
    if (trimmedQuery === "") {
      if (active !== ROLE.HOME && home) {
        row(
          "home",
          <button
            {...stylex.props(button.base, button.ghost, styles.home)}
            onClick={() => pick(active, home, home.label)}
          >
            <HomeIcon size={20} />
            自宅<span {...stylex.props(styles.secondary)}>{home.label}</span>
          </button>,
        );
      }
      history.forEach((historyPoint, i) =>
        row(
          `history-${i}`,
          <button
            {...stylex.props(button.base, button.ghost)}
            onClick={() => pick(active, historyPoint, historyPoint.label)}
          >
            {historyPoint.label}
          </button>,
        ),
      );
    } else if (searched !== trimmedQuery) {
      row(
        "search",
        <button
          {...stylex.props(button.base, button.ghost)}
          // 入力欄の blur（→ リスト非表示）を防ぐ
          onMouseDown={(event) => event.preventDefault()}
          onClick={search}
        >
          🔍 「{trimmedQuery}」で検索
        </button>,
      );
    }
    [...poiHits, ...gsiHits].forEach((hit, i) =>
      row(
        `hit-${i}`,
        <button
          {...stylex.props(button.base, button.ghost)}
          onClick={() => {
            savedActions.historyPushed(hit); // 住所 / 施設名の候補だけ履歴に残す
            pick(active, { lat: hit.lat, lng: hit.lng }, hit.label);
          }}
        >
          {hit.label}
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
        {mode === MODE.HOME_SETUP ? (
          field(ROLE.HOME, null, "自宅", null)
        ) : (
          <>
            {field(ROLE.FROM, from, "出発地", <FromIcon size={20} />)}
            {field(ROLE.TO, to, "到着地", <ToIcon size={20} />)}
          </>
        )}
      </div>
      {rows.length > 0 ? (
        <ul {...stylex.props(styles.list)}>{rows}</ul>
      ) : (
        mode === MODE.EDIT && (
          <button
            {...stylex.props(styles.gear)}
            onClick={tripActions.settingsEntered}
            aria-label="設定"
          >
            <SettingsIcon size={24} />
          </button>
        )
      )}
    </div>
  );
}
