import { create } from "zustand";
import { fetchRoute } from "@/api/graphhopper.ts";
import { narrowSegments } from "@/model/narrow.ts";
import {
  initNav,
  offsetOrigin,
  startText,
  step,
  type NavEvent,
  type NavState,
  type NextNext,
} from "@/model/progress.ts";
import type { Fix, Point } from "@/model/point.ts";
import type { Instruction, RouteModel } from "@/model/route.ts";
import * as speech from "@/api/speech.ts";
import { showToast } from "@/store/toast.ts";
import {
  MODE,
  getTrip,
  selectNarrow,
  selectProfile,
  selectRoute,
  tripActions,
} from "@/store/trip.ts";

/** ナビ開始時の zoom（nav.md「カメラ」） */
export const NAV_ZOOM = 17;

export type Hud = { instruction: Instruction | null; remaining: number; next: NextNext | null };

export type NavStore = {
  nav: NavState | null; // null = ナビ中でない
  hud: Hud | null; // step の hud event の写し
  inNarrow: boolean; // 同 narrow event
  muted: boolean; // セッション内のみ
  starting: boolean; // 「案内開始」の再探索中
};

const useStore = create<NavStore>(() => ({
  nav: null,
  hud: null,
  inNarrow: false,
  muted: false,
  starting: false,
}));

export function useNav<T>(selector: (s: NavStore) => T): T {
  return useStore(selector);
}
export const getNav = useStore.getState;
const set = useStore.setState;

function say(text: string) {
  if (!getNav().muted) speech.speak(text);
}

function dispatch(events: NavEvent[], state: NavState, fix: Fix) {
  for (const ev of events) {
    switch (ev.type) {
      case "speak":
        say(ev.text);
        break;
      case "hud":
        set({ hud: { instruction: ev.instruction, remaining: ev.remaining, next: ev.next } });
        break;
      case "narrow":
        set({ inNarrow: ev.segment !== null });
        break;
      case "arrived":
        navActions.end(false);
        break;
      case "reroute":
        void reroute(state, fix);
        break;
      case "viaPassed": // passedVia は state 内
        break;
    }
  }
}

// リルート（nav.md「リルート」）。出発地は進行方向へ前方オフセット、未通過の経由地 + 到着地、代替なし
async function reroute(state: NavState, f: Fix) {
  const t = getTrip();
  if (!t.to) return;
  const passed = t.passedVia + state.passedVia;
  let r: RouteModel | undefined;
  try {
    [r] = await fetchRoute(
      [offsetOrigin(f, state.heading), ...t.vias.slice(passed), t.to],
      selectProfile(t),
      false,
      new AbortController().signal,
    );
  } catch {
    // r undefined
  }
  if (getTrip().mode !== MODE.NAV) return; // 応答前に終了・到着
  if (!r) {
    showToast("経路を再探索できません");
    // 旧経路で継続、次の連続外れで再試行
    set((s) => ({ nav: s.nav && { ...s.nav, rerouting: false, offRouteCount: 0 } }));
    return;
  }
  const cur = getNav().nav ?? state;
  const now = getTrip().fix ?? f;
  const first = step(r, narrowSegments(r), initNav(cur.zoom, cur.follow), now);
  set({ nav: first.state });
  tripActions.rerouted(r, passed);
  speech.cancel();
  say(`経路を再探索しました。${startText(r, first.state.s)}`);
  dispatch(first.events, first.state, now);
}

export const navActions = {
  // 開始手順（nav.md）: 出発地を fix に置換 → 再探索 1 本 → initNav → 即時 step → 発話。カメラ・Wake Lock は mode から派生
  async start(): Promise<void> {
    const t = getTrip();
    const f = t.fix;
    if (!f || !t.to || getNav().starting) return;
    speech.unlock(); // iOS: ユーザー操作内で初回 speak
    set({ starting: true });
    const origin: Point = { lat: f.lat, lng: f.lng, label: "現在地" };
    let r: RouteModel | undefined;
    try {
      [r] = await fetchRoute(
        [origin, ...t.vias, t.to],
        selectProfile(t),
        false,
        new AbortController().signal,
      );
    } catch {
      // r undefined
    } finally {
      set({ starting: false });
    }
    if (!r) {
      showToast("経路を探索できません");
      return;
    }
    const now = getTrip().fix ?? f;
    const first = step(r, narrowSegments(r), initNav(NAV_ZOOM), now);
    set({ nav: first.state });
    tripActions.navStarted(origin, r);
    say(`案内を開始します。${startText(r, first.state.s)}`);
    dispatch(first.events, first.state, now);
  },
  /** fix ごとに step → events 分配。useGeolocation が trip.fixUpdated の直後に呼ぶ */
  onFix(fix: Fix): void {
    const { nav } = getNav();
    const t = getTrip();
    const route = selectRoute(t);
    if (t.mode !== MODE.NAV || !nav || !route) return;
    const r = step(route, selectNarrow(t), nav, fix);
    set({ nav: r.state });
    dispatch(r.events, r.state, fix);
  },
  end(cancelSpeech: boolean): void {
    if (cancelSpeech) speech.cancel(); // 到着時は「到着しました」を言い切らせる
    tripActions.navEnded(getNav().nav?.passedVia ?? 0);
    set({ nav: null, hud: null, inNarrow: false });
  },
  setFollow(follow: boolean): void {
    set((s) => ({ nav: s.nav && { ...s.nav, follow } }));
  },
  setZoom(zoom: number): void {
    set((s) => ({ nav: s.nav && { ...s.nav, zoom } }));
  },
  toggleMute(): void {
    const muted = !getNav().muted;
    set({ muted });
    if (muted) speech.cancel(); // ON にした時点で再生中・待機中を止める
  },
};
