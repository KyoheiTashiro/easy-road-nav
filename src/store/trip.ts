import { create } from "zustand";
import { PROFILE, type Profile } from "@/api/graphhopper.ts";
import { reverseGeocode } from "@/api/gsi.ts";
import { narrowSegments, type NarrowSegment } from "@/model/narrow.ts";
import {
  ROLE,
  type Fix,
  type LatLng,
  type PickRole,
  type Point,
  type PointRole,
  type Slot,
} from "@/model/point.ts";
import type { RouteModel } from "@/model/route.ts";
import { parseQuery } from "@/model/url.ts";
import { savedActions } from "@/store/saved.ts";
import { showToast } from "@/store/toast.ts";

const NOTOLL_SUFFIX = "&notoll";
// テスト（node）には location が無い
const INIT = parseQuery(typeof location === "undefined" ? "" : location.search);
/** 初回 fix のカメラ（Map）: URL に地点が無ければ現在地へ easeTo。あれば探索後の fitBounds が優先 */
export const URL_HAD_POINTS = INIT.from !== null || INIT.to !== null;

export const MODE = { EDIT: "edit", NAV: "nav", HOME: "home" } as const;
export type Mode = (typeof MODE)[keyof typeof MODE];
export type Popup = { p: LatLng; label: string | null };
type Result = { key: string; routes: RouteModel[]; narrows: NarrowSegment[][] };

export type TripState = {
  mode: Mode;
  from: Point | null;
  to: Point | null;
  vias: Point[];
  notoll: boolean;
  /** 探索結果 + リクエストキー。routes / loading は派生（selectRoutes / selectLoading） */
  result: Result | null;
  selected: number;
  fittedKey: string; // fitBounds 済みの地点集合キー。同じ地点集合の再探索（トグル・代替）ではカメラを動かさない
  fitVersion: number;
  sheetExpanded: boolean;
  popup: Popup | null;
  fix: Fix | null;
  gpsError: boolean;
  fromDefaulted: boolean; // 出発地の既定（初回 fix）を適用済み。URL に from があれば最初から true
  passedVia: number; // 現在の経路より前に通過した経由地数（リルートで加算、終了時に nav.passedVia を畳む）
};

const unlabeled = (p: LatLng | null): Point | null =>
  p ? { lat: p.lat, lng: p.lng, label: null } : null;

const useStore = create<TripState>(() => ({
  mode: MODE.EDIT,
  from: unlabeled(INIT.from),
  to: unlabeled(INIT.to),
  vias: INIT.vias.map((p) => ({ ...p, label: null })),
  notoll: INIT.notoll,
  result: null,
  selected: 0,
  fittedKey: "",
  fitVersion: 0,
  sheetExpanded: false,
  popup: null,
  fix: null,
  gpsError: typeof navigator === "undefined" || !navigator.geolocation,
  fromDefaulted: INIT.from !== null,
  passedVia: 0,
}));

export function useTrip<T>(selector: (s: TripState) => T): T {
  return useStore(selector);
}
/** async 関数・Map のイベントから最新値を読む（レンダー中には使わない） */
export const getTrip = useStore.getState;
const set = useStore.setState;

// ---- セレクタ（派生値。state には持たない）----

const NO_ROUTES: RouteModel[] = [];
const NO_NARROWS: NarrowSegment[][] = [];
const NO_NARROW: NarrowSegment[] = [];
const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;
const coordLabel = (p: LatLng) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
// 地点集合のキー（座標のみ。label 変化で再探索しない）
const keyOf = (pts: (LatLng | null)[]) => JSON.stringify(pts.map((p) => p && [p.lat, p.lng]));
const complete = (s: TripState) => s.from !== null && s.to !== null;

export const selectPointsKey = (s: TripState): string => keyOf([s.from, ...s.vias, s.to]);
export const selectReqKey = (s: TripState): string =>
  selectPointsKey(s) + (s.notoll ? NOTOLL_SUFFIX : "");
export const selectProfile = (s: TripState): Profile => (s.notoll ? PROFILE.NOTOLL : PROFILE.CAR);
/** 地点が揃い result.key === reqKey のときだけ結果。地点欠けで即空、探索中は旧結果を出さない */
function current(s: TripState): Result | null {
  const r = s.result;
  return r && complete(s) && r.key === selectReqKey(s) ? r : null;
}
export const selectRoutes = (s: TripState): RouteModel[] => current(s)?.routes ?? NO_ROUTES;
export const selectNarrows = (s: TripState): NarrowSegment[][] => current(s)?.narrows ?? NO_NARROWS;
export const selectLoading = (s: TripState): boolean => complete(s) && current(s) === null;
export const selectRoute = (s: TripState): RouteModel | undefined => selectRoutes(s)[s.selected];
export const selectNarrow = (s: TripState): NarrowSegment[] =>
  selectNarrows(s)[s.selected] ?? NO_NARROW;

// ---- アクション ----

const resultOf = (key: string, routes: RouteModel[]): Result => ({
  key,
  routes,
  narrows: routes.map((r) => narrowSegments(r)),
});

/** 逆ジオ。失敗・海上は座標文字列にフォールバック（探索は止めない） */
async function resolveLabel(p: LatLng): Promise<string> {
  try {
    return (await reverseGeocode(p)) ?? coordLabel(p);
  } catch {
    return coordLabel(p);
  }
}
const pending = new Set<string>(); // 逆ジオ飛行中の座標キー（重複排除）

// 地点の変更。通過済み経由地数を戻し、地点が欠けたら次に揃ったとき fitBounds させる
function withPoints(s: TripState, patch: Partial<TripState>): Partial<TripState> {
  const next = { ...s, ...patch };
  return { ...patch, passedVia: 0, fittedKey: complete(next) ? s.fittedKey : "" };
}

export const tripActions = {
  pointSet(role: Slot, p: LatLng, label: string | null): void {
    set((s) => withPoints(s, { [role]: { lat: p.lat, lng: p.lng, label } }));
  },
  viaAdded(p: Point): void {
    set((s) => withPoints(s, { vias: [...s.vias, p] }));
  },
  pointDeleted(role: Slot): void {
    set((s) => withPoints(s, { [role]: null }));
  },
  viaDeleted(i: number): void {
    set((s) => withPoints(s, { vias: s.vias.filter((_, k) => k !== i) }));
  },
  viaMoved(i: number, dir: -1 | 1): void {
    set((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.vias.length) return {};
      const vias = [...s.vias];
      [vias[i], vias[j]] = [vias[j]!, vias[i]!];
      return withPoints(s, { vias });
    });
  },
  notollToggled(notoll: boolean): void {
    set((s) => withPoints(s, { notoll }));
  },
  routesLoaded(reqKey: string, routes: RouteModel[]): void {
    const pointsKey = reqKey.endsWith(NOTOLL_SUFFIX)
      ? reqKey.slice(0, -NOTOLL_SUFFIX.length)
      : reqKey;
    set((s) => ({
      result: resultOf(reqKey, routes),
      selected: 0,
      fittedKey: pointsKey,
      // 地点集合が変わった探索だけカメラを動かす（トグル・代替切替では動かさない）
      fitVersion: s.fittedKey === pointsKey ? s.fitVersion : s.fitVersion + 1,
    }));
  },
  routesFailed(reqKey: string): void {
    showToast("経路を探索できません");
    set({ result: resultOf(reqKey, []) });
  },
  routeSelected(i: number): void {
    set({ selected: i });
  },
  /** label null の地点を逆ジオ。解決時は座標一致かつ label null の地点だけ更新（配列 identity は不変時維持） */
  labelRequested(p: LatLng): void {
    const key = coordLabel(p);
    if (pending.has(key)) return;
    pending.add(key);
    resolveLabel(p).then((label) => {
      pending.delete(key);
      const hit = (x: Point) => x.label === null && same(x, p);
      const apply = (x: Point): Point => (hit(x) ? { ...x, label } : x);
      set((s) => ({
        from: s.from && apply(s.from),
        to: s.to && apply(s.to),
        vias: s.vias.some(hit) ? s.vias.map(apply) : s.vias,
      }));
    });
  },
  fixUpdated(fix: Fix): void {
    set((s) => ({
      fix,
      gpsError: false,
      fromDefaulted: true,
      // 出発地の既定 = 現在地。URL に from が無ければ初回 fix で 1 回だけ置く（以後追従しない。× で消したら空のまま）
      from: s.fromDefaulted ? s.from : (s.from ?? { lat: fix.lat, lng: fix.lng, label: null }),
    }));
  },
  gpsFailed(): void {
    if (!getTrip().gpsError) showToast("現在地を取得できません"); // 立ち上がりで 1 回（連続失敗で連打しない）
    set({ gpsError: true });
  },
  popupOpened(p: LatLng): void {
    set({ popup: { p, label: null } });
    resolveLabel(p).then((label) => set((s) => (s.popup?.p === p ? { popup: { p, label } } : {})));
  },
  popupClosed(): void {
    set({ popup: null });
  },
  popupActionTaken(role: PointRole): void {
    const { popup } = getTrip();
    if (!popup) return;
    const pt: Point = { lat: popup.p.lat, lng: popup.p.lng, label: popup.label };
    if (role === ROLE.VIA) tripActions.viaAdded(pt);
    else tripActions.pointSet(role, pt, pt.label);
    set({ popup: null });
  },
  /** ポップアップ「自宅にする」。label 未確定（逆ジオ中）なら何もしない */
  popupHomeTaken(): void {
    const { popup } = getTrip();
    if (popup && popup.label !== null) tripActions.homeChosen(popup.p, popup.label);
  },
  /** 検索欄の候補。home モードの「現在地」は label 未確定 → ポップアップで逆ジオを待ち「自宅にする」で確定 */
  searchPicked(role: PickRole, p: LatLng, label: string | null): void {
    if (role !== ROLE.HOME) tripActions.pointSet(role, p, label);
    else if (label === null) tripActions.popupOpened(p);
    else tripActions.homeChosen(p, label);
  },
  homeChosen(p: LatLng, label: string): void {
    savedActions.homeSaved({ lat: p.lat, lng: p.lng, label });
    showToast("自宅を登録しました");
    set({ popup: null, mode: MODE.EDIT });
  },
  homeSetupEntered(): void {
    set({ popup: null, sheetExpanded: false, mode: MODE.HOME });
  },
  editReturned(): void {
    set({ popup: null, mode: MODE.EDIT });
  },
  setSheet(sheetExpanded: boolean): void {
    set({ sheetExpanded });
  },
  /** ナビ開始（nav store から）。出発地を現在地に置換し、経路 1 本を入れる。探索フックは通さない */
  navStarted(origin: Point, route: RouteModel): void {
    set((s) => {
      const next = { ...s, from: origin };
      return {
        from: origin,
        result: resultOf(selectReqKey(next), [route]),
        selected: 0,
        fittedKey: selectPointsKey(next), // ナビ中は fitBounds しない
        popup: null,
        sheetExpanded: false,
        passedVia: 0,
        mode: MODE.NAV,
      };
    });
  },
  /** リルート成功。地点 state は変えない（URL の via は全経由地を維持） */
  rerouted(route: RouteModel, passedVia: number): void {
    set((s) => ({ result: resultOf(selectReqKey(s), [route]), selected: 0, passedVia }));
  },
  navEnded(passedInNav: number): void {
    set((s) => ({
      mode: MODE.EDIT,
      passedVia: s.passedVia + passedInNav, // 編集モードの「通過済」表示用
      fitVersion: s.fitVersion + 1,
    }));
  },
};
