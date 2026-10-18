import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRoute } from "./api/graphhopper.ts";
import { reverseGeocode } from "./api/gsi.ts";
import { narrowSegments } from "./model/narrow.ts";
import {
  initNav,
  offsetOrigin,
  remainingTime,
  startText,
  step,
  type NavEvent,
  type NavState,
} from "./model/progress.ts";
import type {
  Fix,
  Instruction,
  LatLng,
  Point,
  PointRole,
  RouteModel,
  SavedPoint,
} from "./model/route.ts";
import { useGeolocation } from "./nav/useGeolocation.ts";
import { useSpeech } from "./nav/useSpeech.ts";
import { useWakeLock } from "./nav/useWakeLock.ts";
import { loadHistory, loadHome, pushHistory, saveHistory, saveHome } from "./saved.ts";
import { useUpdateCheck } from "./useUpdateCheck.ts";
import { BottomSheet } from "./ui/BottomSheet.tsx";
import { Map, NAV_ZOOM } from "./ui/Map.tsx";
import { NavBar } from "./ui/NavBar.tsx";
import { NavHud } from "./ui/NavHud.tsx";
import { SearchBox } from "./ui/SearchBox.tsx";
import { Toast } from "./ui/Toast.tsx";
import { buildQuery, parseQuery } from "./url.ts";

const MAX_VIAS = 5;
const NO_ROUTES: RouteModel[] = [];
const INIT = parseQuery(location.search);

const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
const coordLabel = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
const unlabeled = (p: LatLng | null): Point | null => p && { ...p, label: null };
// 地点集合のキー（座標のみ。label 変化で再探索しない）。null を含めば探索しない
const keyOf = (pts: (LatLng | null)[]) => JSON.stringify(pts.map((p) => p && [p.lat, p.lng]));

/** 逆ジオ。失敗・海上は座標文字列にフォールバック（探索は止めない） */
async function resolveLabel(p: LatLng): Promise<string> {
  try {
    return (await reverseGeocode(p)) ?? coordLabel(p);
  } catch {
    return coordLabel(p);
  }
}

export default function App() {
  const [from, setFrom] = useState(unlabeled(INIT.from));
  const [to, setTo] = useState(unlabeled(INIT.to));
  const [vias, setVias] = useState<Point[]>(INIT.vias.map((p) => ({ ...p, label: null })));
  const [notoll, setNotoll] = useState(INIT.notoll);
  // 探索結果はリクエストキー付き。routes / loading は派生（地点欠けで即空、探索中は旧結果を出さない）
  const [result, setResult] = useState<{ key: string; routes: RouteModel[] } | null>(null);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [fitVersion, setFitVersion] = useState(0);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [popup, setPopup] = useState<{ p: LatLng; label: string | null } | null>(null);
  // 自宅・検索履歴（localStorage。URL には入れない）
  const [home, setHome] = useState(loadHome);
  const [recent, setRecent] = useState(loadHistory); // 検索履歴（history は window.history と衝突）
  const { fix, error: gpsError } = useGeolocation(() => setToast("現在地を取得できません"));
  // ナビ（docs/design/nav.md）
  const [mode, setMode] = useState<"edit" | "nav" | "home">("edit");
  const [nav, setNav] = useState<NavState | null>(null);
  const [muted, setMuted] = useState(false); // セッション内のみ
  const [hud, setHud] = useState<{ instruction: Instruction | null; remaining: number } | null>(
    null,
  );
  const [inNarrow, setInNarrow] = useState(false);
  const [starting, setStarting] = useState(false); // 「案内開始」の再探索中
  // 現在の経路より前に通過した経由地数（リルートで加算）。通過済 表示 = これ + nav.passedVia
  const [passedVia, setPassedVia] = useState(0);
  const speech = useSpeech(muted);
  useWakeLock(mode === "nav");
  useUpdateCheck(mode === "nav");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const fixRef = useRef(fix);
  fixRef.current = fix;
  const navRef = useRef(nav);
  navRef.current = nav;

  // 出発地の既定 = 現在地。URL に from がなければ初回 fix で 1 回だけ置く（fix 追従はしない。× で消したら空のまま）
  const defaulted = useRef(INIT.from !== null);
  useEffect(() => {
    if (defaulted.current || !fix) return;
    defaulted.current = true;
    setFrom((f) => f ?? { lat: fix.lat, lng: fix.lng, label: null });
  }, [fix]);

  const points = [from, ...vias, to];
  const pointsKey = keyOf(points);
  const notollSuffix = notoll ? "&notoll" : "";
  const reqKey = pointsKey + notollSuffix;
  const complete = points.every(Boolean);
  const routes = complete && result?.key === reqKey ? result.routes : NO_ROUTES;
  const loading = complete && result?.key !== reqKey;
  const narrows = useMemo(() => routes.map((r) => narrowSegments(r)), [routes]);
  const route = routes[selected];
  const narrow = narrows[selected] ?? [];
  const fittedKey = useRef("");

  // 探索
  useEffect(() => {
    const pts = JSON.parse(pointsKey) as ([number, number] | null)[];
    setPassedVia(0);
    if (pts.some((p) => !p)) {
      fittedKey.current = "";
      return;
    }
    if (modeRef.current === "nav") return; // ナビ開始時の出発地置換。経路は onStart が入れる
    const ac = new AbortController();
    fetchRoute(
      pts.map((p) => ({ lat: p![0], lng: p![1] })),
      reqKey.endsWith("&notoll") ? "car_notoll" : "car",
      pts.length === 2, // 経由地なしのみ代替経路
      ac.signal,
    )
      .then((rs) => {
        setResult({ key: reqKey, routes: rs });
        setSelected(0);
        if (fittedKey.current !== pointsKey) {
          fittedKey.current = pointsKey;
          setFitVersion((v) => v + 1);
        }
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setToast("経路を探索できません");
        setResult({ key: reqKey, routes: [] });
      });
    return () => ac.abort();
  }, [pointsKey, reqKey]);

  // URL 同期
  useEffect(() => {
    history.replaceState(null, "", buildQuery({ from, to, vias, notoll }) || location.pathname);
  }, [from, to, vias, notoll]);

  // label null の地点を逆ジオ（URL 復元・逆ジオ完了前の確定の両方）
  const pending = useRef(new Set<string>());
  useEffect(() => {
    for (const p of [from, to, ...vias]) {
      if (!p || p.label !== null) continue;
      const key = coordLabel(p);
      if (pending.current.has(key)) continue;
      pending.current.add(key);
      resolveLabel(p).then((label) => {
        pending.current.delete(key);
        const hit = (x: Point | null) => !!x && x.label === null && same(x, p);
        const apply = <T extends Point | null>(x: T): T => (hit(x) ? ({ ...x, label } as T) : x);
        setFrom(apply);
        setTo(apply);
        setVias((vs) => (vs.some(hit) ? vs.map(apply) : vs)); // 配列 identity を保つ
      });
    }
  }, [from, to, vias]);

  // ---- ナビ ----

  function endNav(cancelSpeech: boolean) {
    if (cancelSpeech) speech.cancel(); // 到着時は「到着しました」を言い切らせる
    setPassedVia((v) => v + (navRef.current?.passedVia ?? 0)); // 編集モードの「通過済」表示用
    setMode("edit");
    setNav(null);
    setHud(null);
    setInNarrow(false);
    setFitVersion((v) => v + 1);
  }

  function dispatch(events: NavEvent[], state: NavState, f: Fix) {
    for (const ev of events) {
      switch (ev.type) {
        case "speak":
          speech.speak(ev.text);
          break;
        case "hud":
          setHud({ instruction: ev.instruction, remaining: ev.remaining });
          break;
        case "narrow":
          setInNarrow(ev.segment !== null);
          break;
        case "arrived":
          endNav(false);
          break;
        case "reroute":
          reroute(state, f);
          break;
        case "viaPassed": // passedVia は state 内
          break;
      }
    }
  }

  // 開始手順（nav.md）: 出発地を fix に置換 → 再探索 1 本 → initNav → 即時 step → 発話。カメラ・Wake Lock は mode から派生
  async function onStart() {
    const f = fixRef.current;
    if (!f || !to || starting) return;
    speech.unlock(); // iOS: ユーザー操作内で初回 speak
    setStarting(true);
    const origin: Point = { lat: f.lat, lng: f.lng, label: "現在地" };
    const pts = [origin, ...vias, to];
    let r: RouteModel | undefined;
    try {
      [r] = await fetchRoute(
        pts,
        notoll ? "car_notoll" : "car",
        false,
        new AbortController().signal,
      );
    } catch {
      // r undefined
    } finally {
      setStarting(false);
    }
    if (!r) {
      setToast("経路を探索できません");
      return;
    }
    const key = keyOf(pts);
    fittedKey.current = key; // ナビ中は fitBounds しない
    setFrom(origin);
    setResult({ key: key + notollSuffix, routes: [r] });
    setSelected(0);
    setPopup(null);
    setSheetExpanded(false);
    setPassedVia(0);
    const first = step(r, narrowSegments(r), initNav(NAV_ZOOM), fixRef.current ?? f);
    setNav(first.state);
    navRef.current = first.state;
    setMode("nav");
    speech.speak(`案内を開始します。${startText(r, first.state.s)}`);
    dispatch(first.events, first.state, fixRef.current ?? f);
  }

  // リルート（nav.md「リルート」）。出発地は進行方向へ前方オフセット、未通過の経由地 + 到着地、代替なし
  async function reroute(state: NavState, f: Fix) {
    if (!to) return;
    const passed = passedVia + state.passedVia;
    let r: RouteModel | undefined;
    try {
      [r] = await fetchRoute(
        [offsetOrigin(f, state.heading), ...vias.slice(passed), to],
        notoll ? "car_notoll" : "car",
        false,
        new AbortController().signal,
      );
    } catch {
      // r undefined
    }
    if (modeRef.current !== "nav") return; // 応答前に終了・到着
    if (!r) {
      setToast("経路を再探索できません");
      setNav((n) => n && { ...n, rerouting: false, offRouteCount: 0 }); // 旧経路で継続、次の連続外れで再試行
      return;
    }
    const cur = navRef.current ?? state;
    const now = fixRef.current ?? f;
    const first = step(r, narrowSegments(r), initNav(cur.zoom, cur.follow), now);
    setPassedVia(passed);
    setResult({ key: reqKey, routes: [r] }); // 地点 state は変えない（URL の via は全経由地を維持）
    setSelected(0);
    setNav(first.state);
    navRef.current = first.state;
    speech.cancel();
    speech.speak(`経路を再探索しました。${startText(r, first.state.s)}`);
    dispatch(first.events, first.state, now);
  }

  // fix ごとに step → events 分配。閉包は fix 変化時のレンダーのものなので nav / route は最新
  useEffect(() => {
    if (mode !== "nav" || !nav || !route || !fix) return;
    const r = step(route, narrow, nav, fix);
    setNav(r.state);
    navRef.current = r.state;
    dispatch(r.events, r.state, fix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix]);

  // トースト 4 秒消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function onTap(p: LatLng) {
    setPopup({ p, label: null });
    resolveLabel(p).then((label) =>
      setPopup((prev) => (prev && prev.p === p ? { ...prev, label } : prev)),
    );
  }

  // 自宅を保存して編集モードへ戻る
  function saveAsHome(p: LatLng, label: string) {
    const h: SavedPoint = { lat: p.lat, lng: p.lng, label };
    saveHome(h);
    setHome(h);
    setToast("自宅を登録しました");
    setPopup(null);
    setMode("edit");
  }

  function onSearchSet(role: "from" | "to" | "home", p: LatLng, label: string | null) {
    if (role === "home") {
      // 「現在地」は label 未確定 → ポップアップで逆ジオを待ち「自宅にする」で確定
      if (label === null) onTap(p);
      else saveAsHome(p, label);
      return;
    }
    (role === "from" ? setFrom : setTo)({ ...p, label });
  }

  function onPick(p: SavedPoint) {
    setRecent((h) => {
      const next = pushHistory(h, p);
      saveHistory(next);
      return next;
    });
  }

  function onPopupAction(role: "from" | "to" | "via" | "home") {
    if (!popup) return;
    if (role === "home") {
      if (popup.label !== null) saveAsHome(popup.p, popup.label);
      return;
    }
    const pt = { ...popup.p, label: popup.label };
    if (role === "from") setFrom(pt);
    else if (role === "to") setTo(pt);
    else setVias((vs) => [...vs, pt]);
    setPopup(null);
  }

  function onDelete(role: PointRole) {
    if (role === "from") setFrom(null);
    else if (role === "to") setTo(null);
    else setVias((vs) => vs.filter((_, i) => i !== role.via));
  }

  function onMoveVia(i: number, dir: -1 | 1) {
    setVias((vs) => {
      const j = i + dir;
      if (j < 0 || j >= vs.length) return vs;
      const next = [...vs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  return (
    <>
      <Map
        mode={mode}
        nav={nav}
        from={from}
        to={to}
        vias={vias}
        home={home}
        fix={fix}
        routes={routes}
        selected={selected}
        fitVersion={fitVersion}
        popup={popup}
        canAddVia={vias.length < MAX_VIAS}
        onTap={onTap}
        onPopupAction={onPopupAction}
        onPopupClose={() => setPopup(null)}
        onMarkerDelete={onDelete}
        onDragStart={() => setNav((n) => n && { ...n, follow: false })}
        onZoomEnd={(zoom) => setNav((n) => n && { ...n, zoom })}
      />
      {mode === "nav" && nav && route && fix ? (
        /* fix は開始条件なのでナビ中は常にある */
        <>
          <NavHud
            instruction={hud?.instruction ?? null}
            remaining={hud?.remaining ?? route.distance - nav.s}
            inNarrow={inNarrow}
            rerouting={nav.rerouting}
          />
          <NavBar
            remainingMs={remainingTime(route, nav.s)}
            arrivalAt={fix.t + remainingTime(route, nav.s)}
            muted={muted}
            onMute={() => setMuted((m) => !m)}
            onEnd={() => endNav(true)}
            follow={nav.follow}
            onFollow={() => setNav((n) => n && { ...n, follow: true })}
          />
        </>
      ) : (
        <>
          <SearchBox
            key={mode} // モード切替で入力 state を捨てる
            mode={mode === "home" ? "home" : "edit"}
            from={from}
            to={to}
            fix={gpsError ? null : fix}
            home={home}
            history={recent}
            onSet={onSearchSet}
            onPick={onPick}
            onClear={onDelete}
            onBack={() => {
              setPopup(null);
              setMode("edit");
            }}
            onError={setToast}
          />
          {mode === "edit" && (
            <BottomSheet
              expanded={sheetExpanded}
              onExpand={setSheetExpanded}
              from={from}
              to={to}
              vias={vias}
              passedVia={passedVia}
              onDelete={onDelete}
              onMoveVia={onMoveVia}
              notoll={notoll}
              onNotoll={setNotoll}
              home={home}
              onHomeSetup={() => {
                setPopup(null);
                setSheetExpanded(false);
                setMode("home");
              }}
              routes={routes}
              narrows={narrows}
              selected={selected}
              onSelect={setSelected}
              loading={loading || starting}
              canStart={!!route && !!fix && !gpsError && !starting}
              onStart={onStart}
            />
          )}
        </>
      )}
      <Toast message={toast} navMode={mode === "nav"} />
    </>
  );
}
