# モジュール設計

`src/` 各ファイルの export（型・シグネチャ）。分岐のある箇所だけ擬似コード。
画面・状態は [ui.md](ui.md)、ナビの処理順は [nav.md](nav.md)、経路構造は [route-model.md](route-model.md)。ディレクトリは [frontend.md](../requirements/frontend.md)。

依存方向: `ui/` `hooks/` `App` → `store/` → `api/` → `model/`。`store/` `model/` は React・DOM 非依存（`store/` は fetch を呼ぶ）。`ui/` の下は `map/` `edit/` `nav/` に分け、3 つは互いに import しない（共有するものは `ui/` 直下）。`src/` 内の import は `@/` からの絶対パス（`tsconfig.json` の `paths`、`vite.config.ts` の `resolve.alias`、`babel.config.js` の StyleX `aliases` で同じ対応を持つ）。

## `src/model/point.ts`

地点の共通型。経路の構造（`route.ts`）とは独立。

```ts
export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; t: number }; // t = position.timestamp
export type Point = LatLng & { label: string | null }; // label null = 逆ジオ中
export const ROLE = { FROM: "from", TO: "to", VIA: "via", HOME: "home" } as const;
export type Slot = typeof ROLE.FROM | typeof ROLE.TO; // 出発地 / 到着地
export type PointRole = Slot | typeof ROLE.VIA; // 地図ポップアップの地点指定
export type PickRole = Slot | typeof ROLE.HOME; // 検索欄の種類
export type SavedPoint = LatLng & { label: string }; // 自宅・検索履歴・検索候補。label 確定済みのみ
export const MAX_VIAS = 5; // 経由地の上限（CONTEXT.md）
```

## `src/store/saved.ts`

自宅・検索履歴・アイコンのみ表示。`localStorage`（キー `home` `history` `iconOnly`）が正で、store は起動時に読んだ写し。壊れた JSON・形式違いは `null` / `[]` / `false` として読む（例外を投げない。`localStorage` 不可の環境も同じ）。

```ts
export const HISTORY_MAX = 5; // 検索履歴件数（CONTEXT.md）
export function pushHistory(list: SavedPoint[], p: SavedPoint): SavedPoint[]; // 純関数。同座標（lat・lng 一致）を除いて先頭に追加、HISTORY_MAX 件に切る
type SavedState = { home: SavedPoint | null; history: SavedPoint[]; iconOnly: boolean };
export function useSaved<T>(selector: (s: SavedState) => T): T;
export const getSaved: () => SavedState;
export const savedActions: {
  homeSaved(p: SavedPoint): void; // 保存 → store
  historyPushed(p: SavedPoint): void; // pushHistory → 保存 → store
  iconOnlyToggled(v: boolean): void; // 保存 → store
};
```

読み込み時の検証: `lat` `lng` が有限数で範囲内（`url.ts` の `parseLatLng` と同じ条件）、`label` が文字列。満たさない要素は捨てる。`iconOnly` は `read("iconOnly") === true` のときだけ true（それ以外の値は既定 false）。

テスト `saved.test.ts`: `iconOnly` の読み込み（未保存 → false、`"true"` → true、壊れた値 → false）と `iconOnlyToggled` の保存を既存の自宅・履歴のケースに足す。

## `src/api/graphhopper.ts`

```ts
export const PROFILE = { CAR: "car", NOTOLL: "car_notoll" } as const;
export type Profile = (typeof PROFILE)[keyof typeof PROFILE];
export class RouteError extends Error {} // 400 の message（"Cannot find point" 等）。ネットワーク不達は fetch の TypeError のまま

export function fetchRoute(
  points: LatLng[], // 出発地 → 経由地 → 到着地
  profile: Profile,
  alternatives: boolean, // vias.length === 0 のとき true → alternative_route.max_paths 3
  signal: AbortSignal,
): Promise<RouteModel[]>; // paths[] を fromGhPath で変換。[0] が本線
```

リクエスト body は [route-model.md](route-model.md) の契約。`AbortError` は呼び出し側で握りつぶす（トーストしない）。

## `src/api/gsi.ts`

```ts
export function rankHits(q: string, hits: SavedPoint[]): SavedPoint[]; // q を label に含む候補を先頭へ（安定）
export function searchAddress(q: string, signal: AbortSignal): Promise<SavedPoint[]>; // rankHits 後の全件。title を label に
export function reverseGeocode(p: LatLng, signal?: AbortSignal): Promise<string | null>; // results.lv01Nm。応答 {} → null
```

失敗は throw。呼び出し側がトースト（検索）または座標表示にフォールバック（逆ジオ）。

## `src/api/yahoo.ts`

```ts
export function normalizePoiQuery(q: string): string; // （株）(株)（有）(有) を空白に → trim
export function searchPoi(q: string, signal: AbortSignal): Promise<SavedPoint[]>; // Yahoo! ローカルサーチ。最大 100 件（results = API 上限）。Name を label に
```

JSONP。`<script>` を `document.head` に挿入し、`window[callback]` で受ける。URL は `https://map.yahooapis.jp/search/local/V1/localSearch?appid=…&output=json&results=10&query=…&callback=…`。callback 名は呼び出しごとに一意（連番）。

- appid は `import.meta.env.VITE_YAHOO_APPID`。未設定なら即 throw（トースト「施設検索に失敗しました」になる）
- 応答 `Feature[]` の `Name` を label、`Geometry.Coordinates`（`"lon,lat"` 文字列）を split して lng / lat。`Feature` が無ければ空配列
- 失敗は throw: script の `error` イベント（非 2xx・ネットワーク断）、10 秒タイムアウト、`ResultInfo.Status !== 200`
- `signal` の abort は `AbortError`（`DOMException`）で reject。呼び出し側は fetch と同じ扱いで握りつぶせる
- 終了理由を問わず script 要素と `window[callback]` を削除する

```
normalizePoiQuery: q.replace(/[（(][株有][）)]/g, " ").trim()
  「○○（株）△△事業所」 → 「○○ △△事業所」（削除して「○○△△事業所」にすると 0 件、空白なら 1 件。ADR-0003）
```

## `src/api/speech.ts`

```ts
export function speak(text: string): void;
export function cancel(): void;
export function unlock(): void;
```

- キュー: `speechSynthesis` 内蔵のキューをそのまま使う（`speak` は順に再生される）。自前キューは持たない
- ミュートはここでは見ない。nav store の `say` が `muted` なら `speak` を呼ばない。ミュート ON で再生中・待機中は `cancel`
- 直前の文字列がまだ再生・待機中（`onend` / `onerror` 前）で同一なら捨てる。再生し終えた後の同一文字列は再発話する
- `lang = "ja-JP"`、`rate = 1`。voice は指定しない（既定）
- `cancel`: `speechSynthesis.cancel()`。「終了」・リルート成功時に呼ぶ（到着時は呼ばない。「目的地に到着しました」を言い切る）
- `unlock`: 空文字の発話。iOS Safari はユーザー操作内の `speak` が必要なため `navActions.start` の先頭（click ハンドラ内）で呼ぶ（再探索の await 後では操作文脈が切れる）
- `speechSynthesis` 非対応環境では全て no-op

## `src/model/geo.ts`

```ts
export function haversine(a: LatLng, b: LatLng): number; // m
export function bearing(a: LatLng, b: LatLng): number; // deg、北 0、時計回り、[0, 360)
export function destination(p: LatLng, bearingDeg: number, dist: number): LatLng; // リルート前方オフセット用
export function projectToSegment(p: LatLng, a: LatLng, b: LatLng): { t: number; dist: number };
// 局所平面近似（x = Δlng·cos(lat_a)、y = Δlat、m 換算）。t は線分上パラメータを [0, 1] にクランプ、dist は p から射影点までの m
```

## `src/model/route.ts`

```ts
export type RouteModel = { ... };            // route-model.md の定義そのまま
export type Instruction = RouteModel["instructions"][number];
export type GhPath = { ... };                 // GraphHopper paths[] 要素の必要フィールドだけ型定義
export type GhIntersection = { bearings: number[]; entries: boolean[]; in?: number; out: number };
export const FORK_ANGLE = 45;                 // 分岐判定角（CONTEXT.md）

export function fromGhPath(path: GhPath): RouteModel;
  // cum: haversine 累積。roadClass: 文字列 → kind（CONTEXT.md の表。BUSWAY・OTHER は narrow、TRACK は forbidden）
  // viaIndices: sign == 5 の from
  // details.intersection の各ノードに forkSign を適用し、±7 なら指示を書き換え/分割（route-model.md「分岐合成」）
export function forkSign(x: GhIntersection): number;  // 7（右寄り）/ -7（左寄り）/ 0
export function nearest(route: RouteModel, p: LatLng): { s: number; distanceToRoute: number; segmentIndex: number };
  // 全線分に projectToSegment、dist 最小を採用。s = cum[i] + t × (cum[i+1] − cum[i])
export function segmentBearing(route: RouteModel, i: number): number;  // bearing(P[i], P[i+1])
export function tollDistance(route: RouteModel): number;               // toll.value == "all" の合計 m
export function turnCount(route: RouteModel): number;                  // 右左折の回数。sign 0 / 4 / 5 / ±7 は数えない
```

変換を `model/` に置くのは fixture JSON でテストするため。`api/graphhopper.ts` は fetch と例外変換だけ。

## `src/model/narrow.ts`

```ts
export type NarrowSegment = {
  from: number;
  to: number; // 頂点 index 範囲
  length: number; // m
  atStart: boolean; // from === 0（出発地に接する → 警告しない）
  atEnd: boolean; // to === n − 1（到着地に接する → 「目的地付近」）
};
export function narrowSegments(
  route: RouteModel,
  ignoreBelow = 30,
  mergeBelow = 50,
): NarrowSegment[];
export function entersNarrow(instr: Instruction, segs: NarrowSegment[]): boolean;
// segs.some(s => instr.from <= s.from && s.from < instr.to)。StepList の「⚠ 細い道」
```

生成（適用順は CONTEXT.md「細い道区間」）:

```
raw = route.roadClass.filter(r => r.kind !== "wide")        // narrow + forbidden
// 1. 隣接連結: 前の to == 次の from なら 1 つに
// 2. 区間結合: 前の to と次の from の間の広い道 cum[next.from] − cum[prev.to] < mergeBelow なら結合
merged = []
for seg in raw:
  last = merged 末尾
  if last && cum[seg.from] − cum[last.to] < mergeBelow: last.to = seg.to
  else merged.push({ from: seg.from, to: seg.to })
// 3. 短区間無視
return merged
  .map(s => ({ ...s, length: cum[s.to] − cum[s.from], atStart: s.from === 0, atEnd: s.to === n − 1 }))
  .filter(s => s.length >= ignoreBelow)
```

隣接連結は 2 の特殊ケース（間隔 0）なので 1 ループで済む。描画は `roadClass` を直接使い、この関数を通さない。

## `src/model/progress.ts`

```ts
export type NavState = { ... };   // nav.md
export type NavEvent = ...;       // nav.md
export type NextNext = { instruction: Instruction; distance: number }; // 次の次。distance = 次の案内地点からの距離 m

export function initNav(zoom: number, follow?: boolean): NavState;
  // s 0、segmentIndex 0、heading null、lastFix null、announced 空、passedVia 0、offRouteCount 0、rerouting false
export function step(route: RouteModel, narrow: NarrowSegment[], state: NavState, fix: Fix): { state: NavState; events: NavEvent[] };
export function remainingTime(route: RouteModel, s: number): number;   // ms。nav.md「下部バー」の式
export function startText(route: RouteModel, s: number): string;      // 「この先 1.2 キロ、右方向です」。開始時・リルート後に使う
export function offsetOrigin(fix: Fix, heading: number | null): LatLng;
  // heading null → fix そのまま、それ以外 destination(fix, heading, リルート前方オフセット)
```

`step` の処理順は nav.md。そこに書いていない境界:

```
- state は毎回新オブジェクトを返す。announced も複製してから add（入力 state を変異させない）
- 精度フィルタで弾いた fix は lastFix にも入れない
- 経路外れ中: lastFix があり haversine(lastFix, fix) >= 方位算出最小移動 なら offRouteCount++、heading = bearing(lastFix, fix)、lastFix = fix。
  未満なら offRouteCount・heading・lastFix とも据え置き（停車中は外れを数えない）。lastFix が null なら lastFix = fix のみ
- 経路内に戻った fix: offRouteCount = 0、lastFix = fix、heading = segmentBearing
- 進捗据え置き（nearest.s < state.s）のときも heading は state.segmentIndex の方位、hud は出す
- 経由地通過は while（1 fix で複数経由地を越えたら全部 viaPassed。発話は 1 回）
- 次の案内地点が見つからない（到着直前で sign != 0 の指示が残っていない）→ hud { instruction: null, remaining: cum[n−1] − s, next: null }
- hud.next: 次の案内地点より後の sign != 0 の最初の指示。cum[next.from] − cum[ins.from] が 次の次表示上限 以内のときだけ { instruction, distance }、超えたら null
- 案内予告の「直前の案内地点との間隔」= cum[この指示.from] − cum[直前の sign != 0 指示.from]。先頭の案内地点は出発地からの距離
- narrow event は毎 fix（null 含む）。hud と同じく nav store が `inNarrow` に載せる
- rerouting 中（true）でも精度・最近傍・経路外れ判定は続ける。再発火はしない
```

## `src/model/format.ts`

```ts
export function formatDuration(ms: number): string; // "1 時間 20 分" / "25 分" / 1 分未満 "1 分"。サマリ・下部バー共通
export function formatKm(m: number): string; // "12.3 km"（0.1 km 単位）。サマリ・代替カード
export function formatDistance(m: number): string; // HUD: ≥ 1000 → "1.2 km"、未満 "340 m"（10 m 単位）
export function formatSpokenDistance(m: number): string; // "1.2 キロ" / "300 メートル"（1 km 以上 0.1 km、未満 100 m 単位）
export function formatClock(d: Date): string; // "HH:MM"
```

## `src/model/url.ts`

```ts
export type Query = { from: LatLng | null; to: LatLng | null; vias: LatLng[]; notoll: boolean };
export function parseQuery(search: string): Query; // location.search
export function buildQuery(q: Query): string; // "?from=..&to=..&via=..|..&notoll=0"。地点なし・notoll true（既定）は省略。全部なしなら ""
```

parse:

```
parseLatLng(s) =
  s を "," で分割、2 要素でなければ null。空要素があれば null（Number("") は 0 になるため）
  lat, lng = Number()。Number.isFinite でなければ null
  lat ∉ [-90, 90] または lng ∉ [-180, 180] なら null
from  = parseLatLng(params.get("from"))
to    = parseLatLng(params.get("to"))
vias  = (params.get("via") ?? "").split("|").filter(Boolean).map(parseLatLng).filter(非 null).slice(0, 5)
notoll = params.get("notoll") !== "0"  // 既定は避ける
```

不正な地点はその地点だけ無視（全クエリ破棄しない）。build は `toFixed(5)`。

## `src/store/toast.ts`

```ts
export function useToast(): string | null;
export function showToast(message: string): void; // 置換（1 つだけ）
export function clearToast(): void; // Toast.tsx の 4 秒タイマーが呼ぶ
```

## `src/store/trip.ts`

地点・探索結果・画面モード・GPS fix。フィールドは ui.md「状態」。

```ts
export const MODE = { EDIT: "edit", NAV: "nav", SETTINGS: "settings", HOME: "home" } as const;
export const URL_HAD_POINTS: boolean; // 起動時の URL に from か to があった。Map の初回 fix easeTo を抑止
export function useTrip<T>(selector: (s: TripState) => T): T;
export const getTrip: () => TripState; // async 関数・Effect 内の最新値読み

// セレクタ（参照安定。空配列は定数）
export const selectPointsKey: (s) => string; // 地点座標の文字列化（label を含まない）
export const selectReqKey: (s) => string; // pointsKey + notoll
export const selectProfile: (s) => Profile;
export const selectRoutes: (s) => RouteModel[]; // 地点が揃い result.key === reqKey のときだけ。それ以外 []
export const selectNarrows: (s) => NarrowSegment[][];
export const selectLoading: (s) => boolean; // 地点が揃い result が現在の reqKey でない
export const selectRoute: (s) => RouteModel | undefined; // routes[selected]
export const selectNarrow: (s) => NarrowSegment[];

export const tripActions: {
  // 地点（いずれも passedVia 0、地点が欠けたら fittedKey を空にして次に揃ったとき fitBounds）
  pointSet(role: Slot, p: LatLng, label: string | null): void;
  viaAdded(p: Point): void;
  pointDeleted(role: Slot): void;
  viaDeleted(i: number): void;
  viaMoved(i: number, dir: -1 | 1): void;
  notollToggled(v: boolean): void;
  // 探索（useRouteSearch）
  routesLoaded(reqKey: string, routes: RouteModel[]): void; // result 置換、selected 0。pointsKey が fittedKey と違えば fitVersion++
  routesFailed(reqKey: string): void; // トースト「経路を探索できません」、result は空
  routeSelected(i: number): void; // 選択中と違う経路ならシートを収納
  // 逆ジオ（useReverseGeocode）
  labelRequested(p: LatLng): void; // 座標キーで飛行中を重複排除。解決時は座標一致かつ label null の地点と popup だけ更新
  // GPS（useGeolocation）
  fixUpdated(fix: Fix): void; // gpsError false。初回 fix で from が空なら from = 現在地（label null）
  gpsFailed(): void; // gpsError true。立ち上がりで 1 回だけトースト「現在地を取得できません」。fix は前回値
  // 地図タップ・ポップアップ
  popupOpened(p: LatLng): void; // edit / home モードのみ。label は逆ジオ後に入る
  popupClosed(): void;
  popupActionTaken(role: PointRole): void;
  popupHomeTaken(): void; // 「自宅にする」。label 未確定（逆ジオ中）なら何もしない
  // 検索・設定・自宅
  searchPicked(role: PickRole, p: LatLng, label: string | null): void; // home かつ label null（現在地）は popupOpened で逆ジオを待つ
  homeChosen(p: LatLng, label: string): void; // savedActions.homeSaved → トースト「自宅を登録しました」→ mode settings
  settingsEntered(): void; // edit → settings。popup null、sheetExpanded false
  homeSetupEntered(): void; // settings → home。popup null
  backPressed(): void; // home → settings、settings → edit。popup null。それ以外のモードでは何もしない（旧 editReturned）
  setSheet(v: boolean): void;
  // ナビ（nav store が呼ぶ）
  navStarted(origin: Point, route: RouteModel): void; // from = origin、result = { key: 新 reqKey, routes: [route] }、fittedKey 更新（探索 effect の再 fetch と fitVersion++ を抑止）、mode nav
  rerouted(route: RouteModel, passedVia: number): void; // result 置換（地点は変えない）、passedVia 加算
  navEnded(passedInNav: number): void; // mode edit、passedVia 加算、fitVersion++
};
```

## `src/store/nav.ts`

ナビの進行。`fetchRoute` と `speech` を呼ぶのはここだけ。

```ts
export const NAV_ZOOM = 17; // ナビ開始時の zoom（initNav に渡す）
export type Hud = { instruction: Instruction | null; remaining: number; next: NextNext | null };
export type NavStore = { nav: NavState | null; hud: Hud | null; inNarrow: boolean; muted: boolean; starting: boolean };
export function useNav<T>(selector: (s: NavStore) => T): T;
export const getNav: () => NavStore;
export const navActions: {
  start(): Promise<void>; // nav.md「開始手順」。fix か to が無い・開始中なら何もしない
  onFix(fix: Fix): void; // ナビ中のみ step → events 分配。useGeolocation が tripActions.fixUpdated の直後に呼ぶ
  end(cancelSpeech: boolean): void; // tripActions.navEnded → nav / hud / inNarrow をクリア。「終了」true、到着 false
  setFollow(v: boolean): void; // Map の dragstart / 下部バー「現在地」
  setZoom(zoom: number): void; // Map の zoomend
  toggleMute(): void; // ミュート ON で cancel
};
```

events の分配（`dispatch`）: `speak` → `say`（`muted` なら捨てる）、`hud` / `narrow` → store、`viaPassed` → 何もしない（`nav.passedVia` が state 内）、`arrived` → `end(false)`、`reroute` → `reroute()`:

```
reroute(state, fix):
  fetchRoute([offsetOrigin(fix, heading), ...vias.slice(passedVia), to], profile, false)
  応答時 mode !== "nav" なら何もしない
  失敗: トースト「経路を再探索できません」、rerouting false・offRouteCount 0、旧経路のまま
  成功: initNav(nav.zoom, nav.follow) で最新 fix を step 1 回 → nav 置換 → tripActions.rerouted → cancel() → 発話「経路を再探索しました」+ startText → events 分配
```

テスト `nav.test.ts`: `vi.mock` で `fetchRoute` を差し替え、直線経路で 開始 → 経路外れ 3 回（rerouting true）→ リルート（2 回目の fetch は 2 地点）→ 到着（mode edit、nav null）を通す。

## `src/hooks/`

Effect はここにだけ書く。いずれも引数なし・戻り値なしで、`App` がマウント時に呼ぶ。

- `useGeolocation`: マウントで `watchPosition`（`enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000`）。アンマウントで `clearWatch`。成功: `tripActions.fixUpdated(fix)` → `navActions.onFix(fix)`。失敗（`PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT`）: `tripActions.gpsFailed()`。Geolocation 非対応は store の初期値 `gpsError: true`
- `useRouteSearch`: `useEffect([reqKey])`。`getTrip()` で地点を読み、揃っていてナビ中でなければ `fetchRoute(points, profile, 経由地なし, signal)` → `routesLoaded` / `routesFailed`（AbortError は無視）。cleanup で `abort()`
- `useReverseGeocode`: `useEffect([from, to, vias])` で `label === null` の地点ごとに `tripActions.labelRequested(p)`
- `useUrlSync`: `useEffect([from, to, vias, notoll])` で `history.replaceState(null, "", buildQuery(...) || location.pathname)`
- `useWakeLock(active)`: `active` 中 `navigator.wakeLock?.request("screen")`。非対応なら何もしない。`visibilitychange` で `visible` に戻ったら再取得。`active` が false になったら・アンマウントで `release`
- `useUpdateCheck(blocked)`: standalone PWA は再表示時にページを再読込しない（`tailscale serve` はヘッダ制御不可で `index.html` の heuristic cache も効く）ため自前で更新検知する。`visibilitychange` で `visible` に戻ったら `fetch("/", { cache: "no-store" })`。現在の `<script type="module">` の `src`（hash 付き bundle）が応答に含まれなければ古い → `location.reload()`。`blocked`（ナビ中）なら reload を保留し、false になった時点で実行。fetch 失敗は無視（次回 visible で再試行）。`import.meta.env.DEV` では何もしない

## `src/ui/map/Map.tsx`

props なし。trip store から `mode` `from` `to` `vias` `fix` `routes`（`selectRoutes`）`selected` `fitVersion` `popup` `sheetExpanded`、nav store から `nav`、saved store から `home` を購読。地図への操作は `tripActions`（`popupOpened` `popupClosed` `popupActionTaken` `popupHomeTaken` `pointDeleted` `viaDeleted` `viaAdded` `setSheet`）と `navActions`（`setFollow` `setZoom`）。

```ts
export const NAV_PITCH = 50; // ナビ中の pitch（ナビ開始の jumpTo）
export function Map(): JSX.Element;
```

内部:

- スタイル: `matchMedia("(prefers-color-scheme: dark)")` で `liberty` / `dark` の URL を選ぶ。`change` で `map.setStyle(url)`
- `style.load` のたびに `applyStyleExtras(map)`: ①ラベル上書き（下記）②経路 source `route` `alt` + layer 3 つ（ui.md「経路レイヤー」）③現在地 source `fix` + circle layer 2 つ（精度円・青ドット）。初期化とダーク切替で同じ関数
- ラベル上書き: `map.getStyle().layers` のうち `layout["text-field"]` を持ち、その式に `"ref"` を含まないもの全部に `setLayoutProperty(id, "text-field", ["coalesce", ["get", "name:ja"], ["get", "name"]])`
- 精度円: feature に `r0 = accuracy / (156543.03 × cos(lat))`（zoom 0 での px 半径）を持たせ、`circle-radius: ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "r0"], 22, ["*", ["get", "r0"], 4194304]]`
- 地点マーカー: DOM `Marker` を `useEffect([from, to, vias])` で作り直す。タップで「削除」ポップアップ（経由地の追加可否は `vias.length < MAX_VIAS`）
- 自宅マーカー: DOM `Marker` 1 個を `useEffect([home])` で作り直す（`HomeIcon`）。click は `stopPropagation` のみ
- `useEffect([mode])`: `home` に入ったとき `home` があれば `easeTo(自宅, zoom 15)`（`home` は `useEffectEvent` で読む。自宅の変更では動かさない）
- ポップアップ: MapLibre `Popup` 1 個（`closeOnClick: false`）。`setDOMContent(div)` して `createPortal(…, div)`。内容は `popup` prop（PointPopup）優先、無ければ内部 state のマーカー「削除」ボタン。両方 null で `remove`。開いている間は `setLngLat` のみ（`addTo` し直すと `close` が発火して閉じる）。`close` イベント（×）→ `tripActions.popupClosed`。マーカー click は `stopPropagation`（地図 `click` に伝播させない）
- 現在地: `useEffect([fix])` で `fix` source を更新。初回 fix で `URL_HAD_POINTS` が false なら `easeTo(zoom 15)`（1 回だけ。`fixUpdated` が `from` と `fix` を同時に入れるので `from` の null では判定できない）
- カメラ: `useEffect([fitVersion])`（`fitVersion > 0` のみ）と `useEffect([sheetExpanded])` で `fitBounds`。edit モードのみ。padding は 40、下はそれに シートの高さ（展開時 `clientHeight × layout.half / 100`、収納時 `layout.peek`）を足す。routes / selected は `useEffectEvent` で読む。ナビ中は `useEffect([nav])` で `easeTo`（nav.md「カメラ」。fix は `useEffectEvent` で読む）。ナビ開始・終了で `jumpTo`（`pitch: NAV_PITCH` / 0、padding）/ ジェスチャ制限の切替
- イベント: `click` `dragstart` `zoomend`（`originalEvent` あり）は map 生成時に 1 回登録し、ハンドラは `useEffectEvent`（`click`: edit で `sheetExpanded` なら `setSheet(false)` だけ、それ以外 edit / home なら `popupOpened`。`dragstart` → `setFollow(false)`、`zoomend` → `setZoom`）
- コントロール: `ScaleControl`（bottom-left、帰属表示の上）、`NavigationControl`（コンパスのみ、top-left。`useEffect([mode])` でナビ中は `removeControl`、戻りで `addControl`）。位置の余白は `ui/map/maplibre.css` でオーバーレイを避ける

## `src/ui/map/mapLayers.ts`

`Map` の React 非依存部分。タイルスタイル URL（light / dark）、マーカー DOM（色は `tokens.stylex.ts` の `marker`）（`markerElement` `homeMarkerElement`）、GeoJSON 生成（`fixFeatures` `routeFeatures` `altFeatures`）、`bounds`、`applyStyleExtras`（ラベルの `name:ja` 上書き + 経路・代替・現在地の source / layer。`style.load` のたびに呼ぶ）。`maplibre-gl` を import するので vitest の対象外。

同じディレクトリの `maplibre.css` は MapLibre 既定 UI の上書き（ポップアップの余白、コントロールの位置（左下はシートのピーク高に合わせ、経路なしは `data-sheet-empty` で切替）、コンパス画像 `ui/icons/compass.svg`）。`Map.tsx` が `maplibre-gl.css` の次に import する。

## `src/ui/edit/SearchBox.tsx`

props なし。`App` が `key={mode}` で入力 state を捨てる。購読: `mode`（`home` なら「戻る」+ 自宅欄 1 つ、それ以外は出発地 / 到着地の 2 欄）、`from` `to`、`fix`（`gpsError` 中は null。候補「現在地」の表示条件）、saved store の `home` `history`。操作: 候補選択 → `tripActions.searchPicked(role, p, label)`（label null = 逆ジオへ）、× → `pointDeleted(role)`、「戻る」→ `backPressed`、歯車（edit かつ候補リスト非表示のとき描画）→ `settingsEntered`、住所 / 施設名の候補タップ → `savedActions.historyPushed` の直後に `searchPicked`、失敗 → `showToast`。

空欄候補: `active` あり かつ `query.trim() === ""` のとき、検索結果の代わりに固定行を出す。出発地欄 = 現在地 → 自宅 → 履歴、到着地欄 = 自宅 → 履歴、自宅欄 = 現在地 → 履歴。「現在地」は `fix` あり、「自宅」は `home` ありのときだけ。自宅・履歴行のタップは `searchPicked(role, p, p.label)`（履歴には積まない）。

内部 state: `active`（フォーカス中の欄）、`query`、`searched`（最後に検索したクエリ。フォーカス・候補選択で null）、`gsi` / `poi`（各 `{ q, hits }`）、`inflight`（ref。直近の `AbortController`）。欄の表示値は `active === role ? query : point.label ?? "…"`。表示する候補は `active` あり かつ `result.q === query.trim()` のものだけ（Enter 後に入力を変えると消える）。リストは `[...poiHits, ...gsiHits]` の順。末尾の出典行は各 hits が 1 件以上のとき（「Webサービス by Yahoo! JAPAN」リンク / 「出典: 国土地理院」）。

検索は各欄を包む `<form onSubmit>` の submit（Enter / スマホの「検索」キー。入力欄は `enterKeyHint="search"`）か、候補リスト先頭の「🔍 「q」で検索」行（`q !== "" && searched !== q` のとき表示。`onMouseDown` で preventDefault し入力欄の blur を防ぐ）で `search()` を 1 回:

```
search(): q が空なら何もしない。searched = q
  inflight.current?.abort()、新しい AbortController を inflight に
  searchAddress(q, signal) → setGsi({ q, hits })。失敗トースト「住所検索に失敗しました」
  searchPoi(q, signal)     → setPoi({ q, hits })。失敗トースト「施設検索に失敗しました」
  （AbortError は無視）
```

IME 変換確定の Enter は入力欄の `onKeyDown` で `e.nativeEvent.isComposing || e.keyCode === 229` なら `preventDefault`（Safari は確定 Enter の `isComposing` が false）。候補選択で `query` クリア・`active` null・`searchPicked`。blur は 150 ms 遅延で `active` を外す（候補タップより blur が先に来る）。

## `src/ui/map/PointPopup.tsx`

```ts
type PointPopupProps = {
  mode: typeof MODE.EDIT | typeof MODE.HOME;
  label: string | null;
  canAddVia: boolean;
  onAction(role: PointRole): void;
  onHome(): void; // home モードの「自宅にする」
};
```

`home` モードはボタン「自宅にする」1 つ。`label === null` の間は disabled（保存する label が要る）。

## `src/ui/edit/BottomSheet.tsx`

props なし。購読: `sheetExpanded` `from` `to` `vias` `passedVia`（通過済 表示）`notoll` `selected`、`selectRoutes` `selectNarrows` `selectLoading`、`gpsOk`（= fix あり かつ gpsError でない）、nav store の `starting`。saved store は購読しない（自宅行は Settings へ移した）。`loading` = `selectLoading || starting`。「案内開始」は routes があるときだけ描画し、`!gpsOk`（文言「GPS 待ち」）か `starting` で disabled。操作: ハンドル / サマリ文字部のタップ・スワイプ → `setSheet`、× → `pointDeleted` / `viaDeleted`、▲▼ → `viaMoved`、トグル → `notollToggled`、代替カード → `routeSelected`、「案内開始」→ `navActions.start`。

スワイプは `onTouchStart` で開始 Y・body の `scrollTop`・シートの現在高を取り、`onTouchMove` で inline `max-height` を `[ピーク高, innerHeight × layout.half / 100]`（ピーク高 = 経路なしは `layout.peekEmpty`、ありは `layout.peek`）にクランプして追従（`transition: none`）、`onTouchEnd` で inline を外し 30px 以上なら `setSheet(dy < 0)`。下方向は開始時 `scrollTop > 0` なら無視。`useEffect([expanded])` で展開時に `scrollTop = 0`。経路なしはシートと header の高さを `layout.peekEmpty` にし、シートに `data-sheet-empty` を付ける（`maplibre.css` が `body:has([data-sheet-empty])` で左下コントロールの余白を合わせる）。

内部に地点リスト（タイムライン。別ファイルにしない。記号は `FromIcon` / 番号 / `ToIcon` を `marker` 色で塗る）。ピーク = `RouteSummary`（compact）+ 「案内開始」。展開 = 地点リスト → section（トグル）→ section（代替カード。routes が 2 本以上）→ section（`StepList`）。section は `paddingTop 12` + 上罫線。

## `src/ui/edit/Settings.tsx`

props なし。`settings` モードで `App` が `Map` の上に描く全画面パネル（ui.md「設定画面」）。購読: saved store の `home` `iconOnly`。操作: 「戻る」→ `tripActions.backPressed`、「自宅を設定」/「変更」→ `tripActions.homeSetupEntered`、トグル → `savedActions.iconOnlyToggled(e.target.checked)`。

行は `<label>` + `<input type="checkbox">`（BottomSheet の `toggle` スタイルと同じ。共有が 2 箇所になるので `button.stylex.ts` の隣に `toggle` を出すか、BottomSheet 側に `export` するかは実装時に決める。新規 stylex ファイルは増やさない）。

## `src/ui/edit/RouteSummary.tsx`

```ts
type RouteSummaryProps = {
  routes: RouteModel[];
  narrows: NarrowSegment[][];
  selected: number;
  onSelect(i: number): void;
  loading: boolean;
  compact: boolean;
};
```

`compact` = ピーク行（選択経路）。表示は `format.ts`。2 行構成を `Main`（所要時間 20px 太字 + 距離 14px。代替カードでは先頭にラベル）と `Stats`（細い道合計 > 0 なら `colors.narrow` 背景のチップ「`NarrowIcon` 細い道 x.x km」、0 なら `colors.ok` 色「細い道なし」/ 有料 x.x km（あれば）/ 「`TurnsIcon` 右左折 n 回」）で共有。`Stats` は saved store の `iconOnly` を購読し、true なら 細い道チップ「`NarrowIcon` x.x km」（0 なら何も出さない）/ 有料 / 「`TurnsIcon` n 回」。文言を落とした `span` には `aria-label`（「細い道 1.2 km」「右左折 5 回」）。compact で `loading` か経路なしならスピナー +「探索中…」/「出発地と到着地を設定してください」。`compact=false` は代替カード（`routes.length < 2` なら null。`<button aria-pressed>`、`borderLeftWidth 4`、選択中は `borderColor: accent`）。

## `src/ui/edit/StepList.tsx`

```ts
type StepListProps = { route: RouteModel; narrow: NarrowSegment[] };
```

`instructions` を全部表示（`sign 0` 含む）。各行: `DirectionIcon` / `formatDistance(distance)` / `text` / `streetName`。`entersNarrow` が真なら先頭に「⚠ 細い道」（saved store の `iconOnly` が true なら `NarrowIcon size={14}` だけ、`aria-label`「細い道」）、行背景 `colors.narrowBg`（`margin ±8` で本文の余白まで広げる）。行の上罫線は `:first-child` で消す（section の上罫線と重ねない）。

## `src/ui/nav/NavHud.tsx`

props なし。nav store の `nav` `hud` `inNarrow`、trip store の `selectRoute` を購読。`nav` か経路が無ければ描画しない。残り距離は `hud.remaining`、hud 未着なら `route.distance − nav.s`。`hud.instruction` null → 「目的地まで」+ 残り距離。`hud.next` null なら「その先」行は空（高さ固定）。`nav.rerouting` で「再探索中」。細い道バナーはアイコンのみ表示の対象外（常に文言あり）。

## `src/ui/nav/NavBar.tsx`

props なし。nav store の `nav` `muted`、trip store の `selectRoute` `fix` を購読。`remainingMs = remainingTime(route, nav.s)`、到着予想 = `formatClock(new Date(fix.t + remainingMs))`（render 内で `Date.now` を呼ばない）。ボタン: 「現在地」→ `navActions.setFollow(true)`、ミュート → `toggleMute`、「終了」→ `end(true)`。

## `src/ui/icons/index.tsx`

```ts
export function FromIcon(props: { size?: number }): JSX.Element; // 出発地 = 丸
export function ToIcon(props: { size?: number }): JSX.Element; // 到着地 = ピン
export function HomeIcon(props: { size?: number }): JSX.Element; // 自宅マーカー・設定画面の自宅行
export function NarrowIcon(props: { size?: number }): JSX.Element; // 細い道 = 狭い道路線画。経路サマリ・HUD 細い道バナー
export function TurnsIcon(props: { size?: number }): JSX.Element; // 右左折 = 左右に分かれる T 字矢印。経路サマリ
export function VolumeIcon(props: { size?: number }): JSX.Element; // NavBar ミュートトグル（音声あり）
export function VolumeOffIcon(props: { size?: number }): JSX.Element; // 同（ミュート中）
export function DirectionIcon(props: { sign: number; size?: number }): JSX.Element;
```

同じディレクトリの `*.svg` を `import` し、`<span>` の `mask-image` に置いて `background-color: currentColor` で塗る。SVG 側は色を持たず、親の `color` に従う（ダークモード対応はトークン側）。

`DirectionIcon` の sign → 11 種（nav.md）。矢印 `arrow.svg` 1 本を `rotate()` で回し、左向きは `scaleX(-1)`。`4` `5` は `pin-dot.svg`、`6` は `roundabout.svg`、`±8` `-98` は `uturn.svg`、`±7` は `keep.svg`。未知の sign は直進。

## `src/ui/Toast.tsx`

props なし。`useToast()` と `mode === "nav"`（位置を HUD 下へ。`layout.hud + layout.next + 16px`）を購読。`useEffect([message])` で 4 秒後に `clearToast()`（新しいメッセージでタイマーを張り直す）。

## `src/ui/tokens.stylex.ts`

`defineVars` で色トークン `colors`（`bg` `fg` `surface` `border` `accent` `narrow` `narrowBg` `ok` `danger`）。ライト値 + `@media (prefers-color-scheme: dark)` のダーク値。`narrowBg` は細い道行の背景、`ok` は「細い道なし」の緑。経路線の色（青・オレンジ）は MapLibre 側なのでここに置かない。

`defineConsts` で `marker`（`from` 緑 / `via` 青 / `to` 赤。ライト / ダーク共通）。地図の DOM マーカーとボトムシートの地点リストで共有。

`defineConsts` で `fixedColors`（`onAccent` 色付き背景上の白文字 / `popupFg` MapLibre ポップアップの文字。ライト / ダーク共通）と `shadows`（`card` `marker` `float` `up`）。

スタイルは値を複数並べる shorthand（`padding: "0 16px"` 等）を書かず、`paddingBlock` / `paddingInline` などの longhand で書く。StyleX は longhand を shorthand より優先するので、`button.base` の longhand を部品側の `padding: 0` で上書きできない。

## `src/ui/layout.stylex.ts`

```ts
export const layout = stylex.defineConsts({ peek: 108, peekEmpty: 88, half: 75, navbar: 80, hud: 88, next: 36 }); // px。half のみ vh
```

画面部品の高さ。`BottomSheet`（`peek` 収納時 / `half` 展開時）`NavBar` `NavHud` が自分の高さに使い、`Map` が fitBounds / ナビ時の padding、`Toast` がナビ時の `top` に使う。`defineConsts` の値はコンパイル時に文字列で埋まる。数値は単位なしのまま埋まる（vite dev では `max-height:80` が無効になる。build は lightningcss が px を補うので気づきにくい）ので、`stylex.create` 内では `${layout.peek}px` のように単位を付け、JS で足さず `calc()` に並べる。JS からは数値として読める。

## `src/App.tsx`

状態を持たない。`useGeolocation()` `useRouteSearch()` `useReverseGeocode()` `useUrlSync()` を呼び、`mode` を購読して `useWakeLock(mode === "nav")` `useUpdateCheck(mode === "nav")`。描画は `<Map />` + モード別: nav → `<NavHud /> <NavBar />`、settings → `<Settings />`、edit / home → `<SearchBox key={mode} />` と edit のとき `<BottomSheet />`。末尾に `<Toast />`（Settings より上に重ねる）。

主要な流れ（どこで起きるか）:

- 起動: `store/trip.ts` のモジュール評価で `parseQuery(location.search)` → 地点（label null）。`store/saved.ts` が `localStorage` を読む。`useGeolocation` は即 watch。初回 fix で `from` が空なら `fixUpdated` が現在地を入れ、Map が `URL_HAD_POINTS` false なら `easeTo(zoom 15)`
- 探索: `useRouteSearch`（ui.md「状態」）。`routesLoaded` が `pointsKey` と `fittedKey` を比べて `fitVersion++`
- 逆ジオ: `useReverseGeocode` → `labelRequested`。重複排除と反映は store
- ナビ: `navActions.start` → fix ごとに `useGeolocation` が `navActions.onFix` → `dispatch`。リルート・終了・到着は `store/nav.ts`
- 設定: `settingsEntered` → mode settings。Settings は saved store だけ読み書きする（`iconOnlyToggled`）。`backPressed` で edit
- 自宅設定: Settings の `homeSetupEntered` → mode home。`home` モードのタップは edit と同じく `popupOpened`。保存は `homeChosen` 1 箇所（`popupHomeTaken` と `searchPicked(ROLE.HOME, …)` から）→ mode settings。`backPressed` でも settings
- アイコンのみ表示: `RouteSummary`（`Stats`）`StepList` が各自 `useSaved(s => s.iconOnly)` を購読。props で渡さない
- 検索履歴: SearchBox が `savedActions.historyPushed`。edit・home どちらのモードでも同じ

## `src/main.tsx`

`createRoot` + `StrictMode` + `<App />`。`import "@/stylex.css"`（`button` のリセット + StyleX の出力先）。`import.meta.env.PROD` のときだけ `navigator.serviceWorker.register("/sw.js")`（dev は HMR と干渉）。SW 本体は `public/sw.js`（map-display.md）。

## 設定ファイル

- `babel.config.js`: `babel-plugin-react-compiler`（先頭。公式指定）+ `@stylexjs/babel-plugin`（`runtimeInjection: false`、`unstable_moduleResolution`、`aliases: { "@/*": ["<root>/src/*"] }`）+ `parserOpts.plugins: ["typescript", "jsx"]`。`@vitejs/plugin-react` と `@stylexjs/postcss-plugin` の両方がこれを読む（StyleX 設定の単一ソース）
- `vite.config.ts`: `@vitejs/plugin-react` **5 系**（`react({ babel: { configFile: true } })`。6 系は `babel` オプション廃止のため使わない）、`resolve.alias: { "@": "<root>/src" }`、`server.proxy["/gh"]`（`rewrite` で prefix 除去）、`server.allowedHosts: [".ts.net"]`（実機検証、frontend.md）、`test.passWithNoTests`（`vitest/config` の `defineConfig`）
- `postcss.config.js`: `@stylexjs/postcss-plugin`（`include: ["src/**/*.{ts,tsx}"]`）。`src/stylex.css` に `@stylex;`
- `tsconfig.json`: 単一ファイル（project references なし）。`strict: true`、`noUncheckedIndexedAccess: true`、`include: ["src", "vite.config.ts"]`、`paths: { "@/*": ["./src/*"] }`
- `.oxlintrc.json`: `react` プラグインの `rules-of-hooks`（error）`exhaustive-deps`（warn）。`.oxfmtrc.json`: `printWidth: 100`
- `package.json` scripts: `dev` `build` `preview` `test`（vitest）`typecheck`（`tsc --noEmit`）`lint`（oxlint）`fmt`（oxfmt）`deploy` `deploy:graph`
