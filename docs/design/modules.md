# モジュール設計

`src/` 各ファイルの export（型・シグネチャ）。分岐のある箇所だけ擬似コード。
画面・状態は [ui.md](ui.md)、ナビの処理順は [navigation.md](navigation.md)、経路構造は [route-model.md](route-model.md)。ディレクトリは [frontend.md](../requirements/frontend.md)。

依存方向: `ui/` `hooks/` `App` → `store/` → `api/` → `model/`。`store/` `model/` は React・DOM 非依存（`store/` は fetch を呼ぶ）。`ui/` の下は `map/` `edit/` `navigation/` に分け、3 つは互いに import しない（共有するものは `ui/` 直下）。`src/` 内の import は `@/` からの絶対パス（`tsconfig.json` の `paths`、`vite.config.ts` の `resolve.alias`、`babel.config.js` の StyleX `aliases` で同じ対応を持つ）。

## `src/model/point.ts`

地点の共通型。経路の構造（`route.ts`）とは独立。

```ts
export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & { accuracy: number; timestamp: number }; // timestamp = position.timestamp
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
export function pushHistory(list: SavedPoint[], point: SavedPoint): SavedPoint[]; // 純関数。同座標（lat・lng 一致）を除いて先頭に追加、HISTORY_MAX 件に切る
type SavedState = { home: SavedPoint | null; history: SavedPoint[]; iconOnly: boolean };
export function useSaved<T>(selector: (state: SavedState) => T): T;
export const getSaved: () => SavedState;
export const savedActions: {
  homeSaved(point: SavedPoint): void; // 保存 → store
  historyPushed(point: SavedPoint): void; // pushHistory → 保存 → store
  iconOnlyToggled(iconOnly: boolean): void; // 保存 → store
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
  signal?: AbortSignal,
): Promise<RouteModel[]>; // paths[] を fromGraphHopperPath で変換。[0] が本線
```

リクエスト body は [route-model.md](route-model.md) の契約。10 秒で `TimeoutError`（失敗扱い）。`AbortError` は呼び出し側で握りつぶす（トーストしない）。

## `src/api/gsi.ts`

```ts
export function rankHits(query: string, hits: SavedPoint[]): SavedPoint[]; // query を label に含む候補を先頭へ（安定）
export function searchAddress(query: string, signal?: AbortSignal): Promise<SavedPoint[]>; // rankHits 後の全件。title を label に
export function reverseGeocode(point: LatLng, signal?: AbortSignal): Promise<string | null>; // results.lv01Nm。応答 {} → null
```

失敗・10 秒タイムアウト（`TimeoutError`）は throw。呼び出し側がトースト（検索）または座標表示にフォールバック（逆ジオ）。

## `src/api/yahoo.ts`

```ts
export function normalizePoiQuery(query: string): string; // （株）(株)（有）(有) を空白に → trim
export function searchPoi(query: string, signal: AbortSignal): Promise<SavedPoint[]>; // Yahoo! ローカルサーチ。最大 100 件（results = API 上限）。Name を label に
```

JSONP。`<script>` を `document.head` に挿入し、`window[callback]` で受ける。URL は `https://map.yahooapis.jp/search/local/V1/localSearch?appid=…&output=json&results=10&query=…&callback=…`。callback 名は呼び出しごとに一意（連番）。

- appid は `import.meta.env.VITE_YAHOO_APPID`。未設定なら即 throw（トースト「施設検索に失敗しました」になる）
- 応答 `Feature[]` の `Name` を label、`Geometry.Coordinates`（`"lon,lat"` 文字列）を split して lng / lat。`Feature` が無ければ空配列
- 失敗は throw: script の `error` イベント（非 2xx・ネットワーク断）、10 秒タイムアウト、`ResultInfo.Status !== 200`
- `signal` の abort は `AbortError`（`DOMException`）で reject。呼び出し側は fetch と同じ扱いで握りつぶせる
- 終了理由を問わず script 要素と `window[callback]` を削除する

```
normalizePoiQuery: query.replace(/[（(][株有][）)]/g, " ").trim()
  「○○（株）△△事業所」 → 「○○ △△事業所」（削除して「○○△△事業所」にすると 0 件、空白なら 1 件。ADR-0003）
```

## `src/api/timeout.ts`

```ts
export function withTimeout(signal?: AbortSignal): AbortSignal; // signal と AbortSignal.timeout(10_000) の合成。打ち切りは TimeoutError
```

```ts
export const isAbortError: (error: unknown) => boolean; // 呼び出し側の abort。TimeoutError は false
```

`fetchRoute`・`searchAddress`・`reverseGeocode` が fetch に渡す。`TimeoutError` は `AbortError` と区別され、呼び出し側では失敗扱い（トースト・座標表示）になる。

## `src/api/speech.ts`

```ts
export function speak(text: string): void;
export function cancel(): void;
export function unlock(): void;
```

- キュー: `speechSynthesis` 内蔵のキューをそのまま使う（`speak` は順に再生される）。自前キューは持たない
- ミュートはここでは見ない。navigation store の `say` が `muted` なら `speak` を呼ばない。ミュート ON で再生中・待機中は `cancel`
- 直前の文字列がまだ再生・待機中（`onend` / `onerror` 前）で同一なら捨てる。再生し終えた後の同一文字列は再発話する
- `lang = "ja-JP"`、`rate = 1`。voice は指定しない（既定）
- `cancel`: `speechSynthesis.cancel()`。「終了」・リルート成功時に呼ぶ（到着時は呼ばない。「目的地に到着しました」を言い切る）
- `unlock`: 空文字の発話。iOS Safari はユーザー操作内の `speak` が必要なため `navigationActions.start` の先頭（click ハンドラ内）で呼ぶ（再探索の await 後では操作文脈が切れる）
- `speechSynthesis` 非対応環境では全て no-op

## `src/model/geo.ts`

```ts
export function haversine(a: LatLng, b: LatLng): number; // m
export function bearing(a: LatLng, b: LatLng): number; // deg、北 0、時計回り、[0, 360)
export function destination(point: LatLng, bearingDeg: number, distance: number): LatLng; // リルート前方オフセット用
export function projectToSegment(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): { t: number; distance: number };
// 局所平面近似（x = Δlng·cos(lat_a)、y = Δlat、m 換算）。t は線分上パラメータを [0, 1] にクランプ、distance は point から射影点までの m
```

## `src/model/tuning.ts`

CONTEXT.md「調整値」のうちフロントで使う値。表と同じ順に並べる。細い道・有料ペナルティと速度係数は `graphhopper/config.yml`。

```ts
export const NARROW_IGNORE_BELOW = 30; // 短区間無視 m
export const NARROW_MERGE_BELOW = 50;  // 区間結合 m
export const OFF_ROUTE = 50;           // 経路外れ距離 m
export const REROUTE_COUNT = 3;        // リルート連続回数
export const REROUTE_OFFSET = 30;      // リルート前方オフセット m
export const ACCURACY_MAX = 50;        // 進捗採用精度 m
export const ARRIVE = 30;              // 到着判定 m
export const ANNOUNCE_FAR = 300;       // 案内トリガー距離（予告）m
export const ANNOUNCE_NEAR = 50;       // 案内トリガー距離（直前）m
export const NARROW_WARN = 300;        // 細い道警告距離 m
export const MIN_MOVE = 5;             // 方位算出最小移動 m
export const NEXT_NEXT_MAX = 1000;     // 次の次表示上限 m
export const HISTORY_MAX = 5;          // 検索履歴件数
export const FORK_ANGLE = 45;          // 分岐判定角 deg
```

## `src/model/route.ts`

```ts
export const SIGN = { U_TURN_UNKNOWN: -98, U_TURN_LEFT: -8, KEEP_LEFT: -7, SHARP_LEFT: -3, LEFT: -2, SLIGHT_LEFT: -1, CONTINUE: 0,
  SLIGHT_RIGHT: 1, RIGHT: 2, SHARP_RIGHT: 3, FINISH: 4, VIA_REACHED: 5, ROUNDABOUT: 6, KEEP_RIGHT: 7, U_TURN_RIGHT: 8 } as const;
  // GraphHopper instructions[].sign。sign の比較はすべてこの名前で書く
export type RouteModel = { ... };            // route-model.md の定義そのまま
export type Instruction = RouteModel["instructions"][number];
export type GraphHopperPath = { ... };                 // GraphHopper paths[] 要素の必要フィールドだけ型定義
export type GraphHopperIntersection = { bearings: number[]; entries: boolean[]; in?: number; out: number };

export function fromGraphHopperPath(path: GraphHopperPath): RouteModel;
  // cumulativeDistances: haversine 累積。roadClass: 文字列 → kind（CONTEXT.md の表。BUSWAY・OTHER は narrow、TRACK は forbidden）
  // viaIndices: SIGN.VIA_REACHED の from
  // details.intersection の各ノードに forkSign を適用し、寄り（±7）なら指示を書き換え/分割（route-model.md「分岐合成」）
export function forkSign(intersection: GraphHopperIntersection): number;  // KEEP_RIGHT / KEEP_LEFT / CONTINUE。閾値 FORK_ANGLE
export function nearest(route: RouteModel, point: LatLng): { s: number; distanceToRoute: number; segmentIndex: number };
  // 全線分に projectToSegment、distance 最小を採用。s = cumulativeDistances[i] + t × (cumulativeDistances[i+1] − cumulativeDistances[i])
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
  ignoreBelow = NARROW_IGNORE_BELOW,
  mergeBelow = NARROW_MERGE_BELOW,
): NarrowSegment[];
export function entersNarrow(instruction: Instruction, segments: NarrowSegment[]): boolean;
// segments.some(segment => instruction.from <= segment.from && segment.from < instruction.to)。StepList の「⚠ 細い道」
```

生成（適用順は CONTEXT.md「細い道区間」）:

```
raw = route.roadClass.filter(range => range.kind !== "wide")        // narrow + forbidden
// 1. 隣接連結: 前の to == 次の from なら 1 つに
// 2. 区間結合: 前の to と次の from の間の広い道 cumulativeDistances[next.from] − cumulativeDistances[previous.to] < mergeBelow なら結合
merged = []
for range in raw:
  last = merged 末尾
  if last && cumulativeDistances[range.from] − cumulativeDistances[last.to] < mergeBelow: last.to = range.to
  else merged.push({ from: range.from, to: range.to })
// 3. 短区間無視
return merged
  .map(segment => ({ ...segment, length: cumulativeDistances[segment.to] − cumulativeDistances[segment.from], atStart: segment.from === 0, atEnd: segment.to === vertexCount − 1 }))
  .filter(segment => segment.length >= ignoreBelow)
```

隣接連結は 2 の特殊ケース（間隔 0）なので 1 ループで済む。描画は `roadClass` を直接使い、この関数を通さない。

## `src/model/progress.ts`

```ts
export type NavigationState = { ... };   // navigation.md
export type NavigationEvent = ...;       // navigation.md
export type NextNext = { instruction: Instruction; distance: number }; // 次の次。distance = 次の案内地点からの距離 m

export function initNavigation(zoom: number, follow?: boolean): NavigationState;
  // s 0、segmentIndex 0、heading null、lastFix null、announced 空、passedVia 0、offRouteCount 0、rerouting false
export function step(route: RouteModel, narrow: NarrowSegment[], state: NavigationState, fix: Fix): { state: NavigationState; events: NavigationEvent[] };
export function remainingTime(route: RouteModel, s: number): number;   // ms。navigation.md「下部バー」の式
export function startText(route: RouteModel, s: number): string;      // 「この先 1.2 キロ、右方向です」。開始時・リルート後に使う
export function offsetOrigin(fix: Fix, heading: number | null): LatLng;
  // heading null → fix そのまま、それ以外 destination(fix, heading, リルート前方オフセット)
```

`step` の処理順は navigation.md。そこに書いていない境界:

```
- state は毎回新オブジェクトを返す。announced も複製してから add（入力 state を変異させない）
- 精度フィルタで弾いた fix は lastFix にも入れない
- 経路外れ中: lastFix があり haversine(lastFix, fix) >= 方位算出最小移動 なら offRouteCount++、heading = bearing(lastFix, fix)、lastFix = fix。
  未満なら offRouteCount・heading・lastFix とも据え置き（停車中は外れを数えない）。lastFix が null なら lastFix = fix のみ
- 経路内に戻った fix: offRouteCount = 0、lastFix = fix、heading = segmentBearing
- 進捗据え置き（nearest.s < state.s）のときも heading は state.segmentIndex の方位、hud は出す
- 経由地通過は while（1 fix で複数経由地を越えたら全部 viaPassed。発話は 1 回）
- 次の案内地点が見つからない（到着直前で sign != 0 の指示が残っていない）→ hud { instruction: null, remaining: cumulativeDistances[n−1] − s, next: null }
- hud.next: 次の案内地点より後の sign != 0 の最初の指示。cumulativeDistances[next.from] − cumulativeDistances[instruction.from] が 次の次表示上限 以内のときだけ { instruction, distance }、超えたら null
- 案内予告の「直前の案内地点との間隔」= cumulativeDistances[この指示.from] − cumulativeDistances[直前の sign != 0 指示.from]。先頭の案内地点は出発地からの距離
- narrow event は毎 fix（null 含む）。hud と同じく navigation store が `inNarrow` に載せる
- rerouting 中（true）でも精度・最近傍・経路外れ判定は続ける。再発火はしない
```

## `src/model/format.ts`

```ts
export function formatDuration(ms: number): string; // "1 時間 20 分" / "25 分" / 1 分未満 "1 分"。サマリ・下部バー共通
export function formatKm(meters: number): string; // "12.3 km"（0.1 km 単位）。サマリ・代替カード
export function formatDistance(meters: number): string; // HUD: ≥ 1000 → "1.2 km"、未満 "340 m"（10 m 単位）
export function formatSpokenDistance(meters: number): string; // "1.2 キロ" / "300 メートル"（1 km 以上 0.1 km、未満 100 m 単位）
export function formatClock(date: Date): string; // "HH:MM"
```

## `src/model/url.ts`

```ts
export type Query = { from: LatLng | null; to: LatLng | null; vias: LatLng[]; notoll: boolean };
export function parseQuery(search: string): Query; // location.search
export function buildQuery(query: Query): string; // "?from=..&to=..&via=..|..&notoll=0"。地点なし・notoll true（既定）は省略。全部なしなら ""
```

parse:

```
parseLatLng(text) =
  text を "," で分割、2 要素でなければ null。空要素があれば null（Number("") は 0 になるため）
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
export const MODE = {
  EDIT: "edit",
  NAVIGATION: "navigation",
  SETTINGS: "settings",
  HOME_SETUP: "home",
} as const;
export const URL_HAD_POINTS: boolean; // 起動時の URL に from か to があった。Map の初回 fix easeTo を抑止
export function useTrip<T>(selector: (state: TripState) => T): T;
export const getTrip: () => TripState; // async 関数・Effect 内の最新値読み

// セレクタ（参照安定。空配列は定数）
export const selectPointsKey: (state) => string; // 地点座標の文字列化（label を含まない）
export const selectProfile: (state) => Profile;
export const selectRoutes: (state) => RouteModel[]; // 地点が揃い result の pointsKey・notoll が現在と一致するときだけ。それ以外 []
export const selectNarrows: (state) => NarrowSegment[][];
export const selectLoading: (state) => boolean; // 地点が揃い result が現在の pointsKey・notoll のものでない
export const selectRoute: (state) => RouteModel | undefined; // routes[selected]
export const selectNarrow: (state) => NarrowSegment[];

export const tripActions: {
  // 地点（いずれも passedVia 0、地点が欠けたら fittedKey を空にして次に揃ったとき fitBounds）
  pointSet(role: Slot, point: LatLng, label: string | null): void;
  viaAdded(point: Point): void;
  pointDeleted(role: Slot): void;
  viaDeleted(i: number): void;
  viaMoved(i: number, direction: -1 | 1): void;
  notollToggled(notoll: boolean): void;
  // 探索（useRouteSearch）
  routesLoaded(pointsKey: string, notoll: boolean, routes: RouteModel[]): void; // result 置換、selected 0。pointsKey が fittedKey と違えば fitVersion++
  routesFailed(pointsKey: string, notoll: boolean): void; // トースト「経路を探索できません」、result は空
  routeSelected(i: number): void; // 選択中と違う経路ならシートを収納
  // 逆ジオ（useReverseGeocode）
  labelRequested(point: LatLng): void; // 座標キーで飛行中を重複排除。解決時は座標一致かつ label null の地点と popup だけ更新
  // GPS（useGeolocation）
  fixUpdated(fix: Fix): void; // gpsError false。初回 fix で from が空なら from = 現在地（label null）
  gpsFailed(): void; // gpsError true。立ち上がりで 1 回だけトースト「現在地を取得できません」。fix は前回値
  // 地図タップ・ポップアップ
  popupOpened(point: LatLng): void; // edit / home モードのみ。label は逆ジオ後に入る
  popupClosed(): void;
  popupActionTaken(role: PointRole): void; // kind point のみ
  popupHomeTaken(): void; // 「自宅にする」。kind point で label 未確定（逆ジオ中）なら何もしない
  markerPopupOpened(role: PointRole, index: number, point: LatLng): void; // マーカータップ。地点ポップアップを置き換える
  markerDeleteTaken(): void; // 「削除」。role via → viaDeleted(index)、それ以外 → pointDeleted(role)。popup null
  // 検索・設定・自宅
  searchPicked(role: PickRole, point: LatLng, label: string | null): void; // home かつ label null（現在地）は popupOpened で逆ジオを待つ
  homeChosen(point: LatLng, label: string): void; // savedActions.homeSaved → トースト「自宅を登録しました」→ mode settings
  settingsEntered(): void; // edit → settings。popup null、sheetExpanded false
  homeSetupEntered(): void; // settings → home。popup null
  backPressed(): void; // home → settings、settings → edit。popup null。それ以外のモードでは何もしない（旧 editReturned）
  setSheet(sheetExpanded: boolean): void;
  // ナビ（navigation store が呼ぶ）
  navigationStarted(origin: Point, route: RouteModel): void; // from = origin、result = { pointsKey: 新 pointsKey, notoll, routes: [route] }、fittedKey 更新（探索 effect の再 fetch と fitVersion++ を抑止）、mode navigation
  viaPassed(): void; // passedVia++
  rerouted(route: RouteModel): void; // result 置換（地点は変えない）
  navigationEnded(): void; // mode edit、fitVersion++
};
```

## `src/store/navigation.ts`

ナビの進行。`fetchRoute` と `speech` を呼ぶのはここだけ。

```ts
export const NAVIGATION_ZOOM = 17; // ナビ開始時の zoom（initNavigation に渡す）
export type Hud = { instruction: Instruction | null; remaining: number; next: NextNext | null };
export type NavigationStore = {
  navigation: NavigationState | null;
  hud: Hud | null;
  inNarrow: boolean;
  muted: boolean;
  starting: boolean;
};
export function useNavigation<T>(selector: (store: NavigationStore) => T): T;
export const getNavigation: () => NavigationStore;
export const navigationActions: {
  start(): Promise<void>; // navigation.md「開始手順」。fix か to が無い・開始中なら何もしない
  onFix(fix: Fix): void; // ナビ中のみ step → events 分配。useGeolocation が tripActions.fixUpdated の直後に呼ぶ
  end(cancelSpeech: boolean): void; // tripActions.navigationEnded → navigation / hud / inNarrow をクリア。「終了」true、到着 false
  setFollow(follow: boolean): void; // Map の dragstart / 下部バー「現在地」
  setZoom(zoom: number): void; // Map の zoomend
  toggleMute(): void; // ミュート ON で cancel
};
```

events の分配（`dispatch`）: `speak` → `say`（`muted` なら捨てる）、`hud` / `narrow` → store、`viaPassed` → `tripActions.viaPassed`（通過済み経由地数の合計は trip だけが持つ）、`arrived` → `end(false)`、`reroute` → `reroute()`:

```
reroute(state, fix):
  fetchRoute([offsetOrigin(fix, heading), ...vias.slice(trip.passedVia), to], profile, false)
  応答時 mode !== "navigation" なら何もしない
  失敗: トースト「経路を再探索できません」、rerouting false・offRouteCount 0、旧経路のまま
  成功: initNavigation(navigation.zoom, navigation.follow) で最新 fix を step 1 回 → navigation 置換 → tripActions.rerouted → cancel() → 発話「経路を再探索しました」+ startText → events 分配
```

テスト `navigation.test.ts`: `vi.mock` で `fetchRoute` を差し替え、直線経路で 開始 → 経路外れ 3 回（rerouting true）→ リルート（2 回目の fetch は 2 地点）→ 到着（mode edit、navigation null）を通す。

## `src/hooks/`

App 全体で 1 つの外部同期を書く（1 部品だけが使う Effect は部品の隣のフック）。いずれも引数なし・戻り値なしで、`App` がマウント時に呼ぶ。

- `useGeolocation`: マウントで `watchPosition`（`enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 10000`）。アンマウントで `clearWatch`。成功: `tripActions.fixUpdated(fix)` → `navigationActions.onFix(fix)`。失敗（`PERMISSION_DENIED` / `POSITION_UNAVAILABLE` / `TIMEOUT`）: `tripActions.gpsFailed()`。Geolocation 非対応は store の初期値 `gpsError: true`
- `useRouteSearch`: `useEffect([pointsKey, notoll])`。`getTrip()` で地点を読み、揃っていてナビ中でなければ `fetchRoute(points, profile, 経由地なし, signal)` → `routesLoaded` / `routesFailed`（`isAbortError` は無視）。cleanup で `abort()`
- `useReverseGeocode`: `useEffect([from, to, vias])` で `label === null` の地点ごとに `tripActions.labelRequested(point)`
- `useUrlSync`: `useEffect([from, to, vias, notoll])` で `history.replaceState(null, "", buildQuery(...) || location.pathname)`
- `useWakeLock(active)`: `active` 中 `navigator.wakeLock?.request("screen")`。非対応なら何もしない。`visibilitychange` で `visible` に戻ったら再取得。`active` が false になったら・アンマウントで `release`
- `useUpdateCheck(blocked)`: standalone PWA は再表示時にページを再読込しない（`tailscale serve` はヘッダ制御不可で `index.html` の heuristic cache も効く）ため自前で更新検知する。`visibilitychange` で `visible` に戻ったら `fetch("/", { cache: "no-store" })`。現在の `<script type="module">` の `src`（hash 付き bundle）が応答に含まれなければ古い → `location.reload()`。`blocked`（ナビ中）なら reload を保留し、false になった時点で実行。fetch 失敗は無視（次回 visible で再試行）。`import.meta.env.DEV` では何もしない

## `src/ui/map/Map.tsx`

props なし。地図インスタンスを作り、下の 4 フックへ引数で渡して組み立てる。インスタンスは `useState` に持つ（生成後の再レンダーで各フックの Effect が揃って走る）。自身が購読するのは現在地ボタン用の `mode` `fix` `gpsError` `sheetExpanded` だけ。

```ts
export function Map(): JSX.Element;
```

- 生成: div の callback ref（cleanup を返す）で `new maplibregl.Map`。アンマウントで `remove`
- スタイル: `matchMedia("(prefers-color-scheme: dark)")` で `liberty` / `dark` の URL を選ぶ。`change` で `map.setStyle(url)`
- `style.load` のたびに `applyStyleExtras(map, useRouteLayers の最新データ)`: ①ラベル上書き（下記）②経路 source `route` `alternative` + layer 3 つ（ui.md「経路レイヤー」）③現在地 source `fix` + circle layer 2 つ（精度円・青ドット）。初期化とダーク切替で同じ関数。リスナーは生成と同時に登録する（フックの Effect を待つと初回の `style.load` を取りこぼしうる）
- ラベル上書き: `map.getStyle().layers` のうち `layout["text-field"]` を持ち、その式に `"ref"` を含まないもの全部に `setLayoutProperty(id, "text-field", ["coalesce", ["get", "name:ja"], ["get", "name"]])`
- 精度円: feature に `baseRadius = accuracy / (156543.03 × cos(lat))`（zoom 0 での px 半径）を持たせ、`circle-radius: ["interpolate", ["exponential", 2], ["zoom"], 0, ["get", "baseRadius"], 22, ["*", ["get", "baseRadius"], 4194304]]`
- コントロール: `ScaleControl`（bottom-left、帰属表示の上）、現在地ボタン（bottom-right。中身は portal、edit で収納中か home のときだけ描画）。コンパスは `useCamera` が持つ。位置の余白は `ui/map/maplibre.css` でオーバーレイを避ける

各フックの引数は `map: maplibregl.Map | null`。購読は各フックが自分で行う。Effect の実行順は呼び出し順（useRouteLayers → useMarkers → useMapPopup → useCamera）。

### `useRouteLayers.ts`

```ts
export function useRouteLayers(map): RefObject<{ route; alternative; fix }>; // style.load で使う最新データ
```

- `useEffect([routes, selected, mode])` で `route` `alternative` source を更新（home モードでは空）
- `useEffect([fix])` で `fix` source を更新

### `useMarkers.tsx`

```ts
export function useMarkers(map): ReactNode; // 自宅アイコンの portal
```

- 地点マーカー: DOM `Marker` を `useEffect([from, to, vias, mode])` で作り直す（home モードでは出さない）。タップで `markerPopupOpened`（「削除」ポップアップ）
- 自宅マーカー: DOM `Marker` 1 個を `useEffect([home])` で作り直す（`HomeIcon`）。全モードで表示。click は `stopPropagation` のみ

### `useMapPopup.tsx`

```ts
export function useMapPopup(map): ReactNode; // ポップアップ中身の portal
```

- MapLibre `Popup` 1 個（`closeOnClick: false`）。`setDOMContent(div)` して `createPortal(…, div)`。内容は `popup.kind` で分岐（`point` → PointPopup、`marker` → 「削除」ボタン → `markerDeleteTaken`）。null で `remove`。開いている間は `setLngLat` のみ（`addTo` し直すと `close` が発火して閉じる）。`close` イベント（×）→ `tripActions.popupClosed`。マーカー click は `stopPropagation`（地図 `click` に伝播させない）
- 地図 `click`（ハンドラは `useEffectEvent`）: navigation では無視。edit で `sheetExpanded` なら `setSheet(false)` だけ、それ以外 edit / home なら `popupOpened`

### `useCamera.ts`

カメラの Effect は順序の制約があるので 1 ファイルにまとめる。

```ts
export const NAVIGATION_PITCH = 50; // ナビ中の pitch（ナビ開始の jumpTo）
export const LOCATE_ZOOM = 15; // 現在地ボタン・候補への移動の最小 zoom
export function useCamera(map): void;
```

- イベント（ハンドラは `useEffectEvent`）: `dragstart`（2 本指を除く）→ `setFollow(false)`、`zoomend`（`originalEvent` あり）→ `setZoom`。どちらも navigation のみ
- 初回 fix: `URL_HAD_POINTS` が false なら `easeTo(zoom 15)`（1 回だけ。`fixUpdated` が `from` と `fix` を同時に入れるので `from` の null では判定できない）
- `useEffect([panTarget])`: 候補選択で `easeTo`
- `useEffect([mode])`: ナビ開始・終了で `jumpTo`（`pitch: NAVIGATION_PITCH` / 0、padding）、ジェスチャ制限、`NavigationControl`（コンパスのみ、top-left）をナビ中は外し戻りで付ける。`home` に入ったとき `home` があれば `easeTo(自宅, zoom 15)`（`home` は `useEffectEvent` で読む。自宅の変更では動かさない）。fitVersion の Effect より前に置く
- ナビ中は `useEffect([navigation])` で `easeTo`（navigation.md「カメラ」。fix は `useEffectEvent` で読む）
- `useEffect([fitVersion])`（`fitVersion > 0` のみ）と `useEffect([sheetExpanded])` で `fitBounds`。edit モードのみ。padding は 40、下はそれに シートの高さ（展開時 `clientHeight × layout.half / 100`、収納時 `layout.peek`）を足す。routes / selected は `useEffectEvent` で読む

## `src/ui/map/mapLayers.ts`

`Map` の React 非依存部分。タイルスタイル URL（light / dark）、マーカー DOM（色は `tokens.stylex.ts` の `marker`）（`markerElement` `homeMarkerElement`）、GeoJSON 生成（`fixFeatures` `routeFeatures` `alternativeFeatures`）、`bounds`、`applyStyleExtras`（ラベルの `name:ja` 上書き + 経路・代替・現在地の source / layer。`style.load` のたびに呼ぶ）。`maplibre-gl` を import するので vitest の対象外。

同じディレクトリの `maplibre.css` は MapLibre 既定 UI の上書き（ポップアップの余白、コントロールの位置（左下はシートのピーク高に合わせ、経路なしは `data-sheet-empty` で切替）、コンパス画像 `ui/icons/compass.svg`）。`Map.tsx` が `maplibre-gl.css` の次に import する。

## `src/ui/edit/SearchBox.tsx`

props なし。`App` が `key={mode}` で入力 state を捨てる。購読: `mode`（`home` なら「戻る」+ 自宅欄 1 つ、それ以外は出発地 / 到着地の 2 欄）、`from` `to`、`fix`（`gpsError` 中は null。候補「現在地」の表示条件）、saved store の `home` `history`。操作: 候補選択 → `tripActions.searchPicked(role, point, label)`（label null = 逆ジオへ）、× → `pointDeleted(role)`、「戻る」→ `backPressed`、歯車（edit かつ候補リスト非表示のとき描画）→ `settingsEntered`、住所 / 施設名の候補タップ → `savedActions.historyPushed` の直後に `searchPicked`、失敗 → `showToast`。

空欄候補: `active` あり かつ `query.trim() === ""` のとき、検索結果の代わりに固定行を出す。出発地欄 = 現在地 → 自宅 → 履歴、到着地欄 = 自宅 → 履歴、自宅欄 = 現在地 → 履歴。「現在地」は `fix` あり、「自宅」は `home` ありのときだけ。自宅・履歴行のタップは `searchPicked(role, point, point.label)`（履歴には積まない）。

内部 state: `active`（フォーカス中の欄）、`query`。検索の状態は `useSearch(trimmedQuery)`（`trimmedQuery = query.trim()`）が持つ。欄の表示値は `active === role ? query : point.label ?? "…"`。表示する候補は `active` ありのときの `gsiHits` / `poiHits`。リストは `[...poiHits, ...gsiHits]` の順。末尾の出典行は各 hits が 1 件以上のとき（「Webサービス by Yahoo! JAPAN」リンク / 「出典: 国土地理院」）。

検索は各欄を包む `<form onSubmit>` の submit（Enter / スマホの「検索」キー。入力欄は `enterKeyHint="search"`）か、候補リスト先頭の「🔍 「trimmedQuery」で検索」行（`trimmedQuery !== "" && searched !== trimmedQuery` のとき表示。`onMouseDown` で preventDefault し入力欄の blur を防ぐ）で `search()` を 1 回呼ぶ（`useSearch`）。

IME 変換確定の Enter は入力欄の `onKeyDown` で `event.nativeEvent.isComposing || event.keyCode === 229` なら `preventDefault`（Safari は確定 Enter の `isComposing` が false）。候補選択で `query` クリア・`active` null・`searchPicked`。blur は 150 ms 遅延で `active` を外す（候補タップより blur が先に来る）。

### `useSearch.ts`

```ts
export function useSearch(query: string): {
  search(): void;
  searched: string | null; // 最後に検索したクエリ
  reset(): void; // searched = null（フォーカス・候補選択）
  gsiHits: SavedPoint[]; // 結果のクエリが query と一致するものだけ（Enter 後に入力を変えると消える）
  poiHits: SavedPoint[];
};
```

内部 state: `gsi` / `poi`（各 `{ query, hits }`）、`searched`、`inflight`（ref。直近の `AbortController`）。

```
search(): query が空なら何もしない。searched = query
  inflight.current?.abort()、新しい AbortController を inflight に
  searchAddress(query, signal) → setGsi({ query, hits })。失敗トースト「住所検索に失敗しました」
  searchPoi(query, signal)     → setPoi({ query, hits })。失敗トースト「施設検索に失敗しました」
  （isAbortError は無視）
```

## `src/ui/map/PointPopup.tsx`

```ts
type PointPopupProps = {
  mode: typeof MODE.EDIT | typeof MODE.HOME_SETUP;
  label: string | null;
  canAddVia: boolean;
  onAction(role: PointRole): void;
  onHome(): void; // home モードの「自宅にする」
};
```

`home` モードはボタン「自宅にする」1 つ。`label === null` の間は disabled（保存する label が要る）。

## `src/ui/edit/BottomSheet.tsx`

props なし。購読: `sheetExpanded` `from` `to` `vias` `passedVia`（通過済 表示）`notoll` `selected`、`selectRoutes` `selectNarrows` `selectLoading`、`gpsOk`（= fix あり かつ gpsError でない）、navigation store の `starting`。saved store は購読しない（自宅行は Settings へ移した）。`loading` = `selectLoading || starting`。「案内開始」は routes があるときだけ描画し、`!gpsOk`（文言「GPS 待ち」）か `starting` で disabled。操作: ハンドル / サマリ文字部のタップ・スワイプ → `setSheet`、× → `pointDeleted` / `viaDeleted`、▲▼ → `viaMoved`、トグル → `notollToggled`、代替カード → `routeSelected`、「案内開始」→ `navigationActions.start`。

スワイプは `useSheetDrag(body, expanded, peek)`（同じディレクトリ）が返す `ref` とタッチハンドラをシートに渡す。`onTouchStart` で開始 Y・body の `scrollTop`・シートの現在高を取り、`onTouchMove` で inline `max-height` を `[ピーク高, innerHeight × layout.half / 100]`（ピーク高 = 経路なしは `layout.peekEmpty`、ありは `layout.peek`）にクランプして追従（`transition: none`）、`onTouchEnd` で inline を外し 30px 以上なら `setSheet(dy < 0)`。下方向は開始時 `scrollTop > 0` なら無視。`touchcancel` でも inline を外す。BottomSheet 側は `useEffect([expanded])` で展開時に `scrollTop = 0`。経路なしはシートと header の高さを `layout.peekEmpty` にし、シートに `data-sheet-empty` を付ける（`maplibre.css` が `body:has([data-sheet-empty])` で左下コントロールの余白を合わせる）。

内部に地点リスト（タイムライン。別ファイルにしない。記号は `FromIcon` / 番号 / `ToIcon` を `marker` 色で塗る）。ピーク = `RouteSummary`（compact）+ 「案内開始」。展開 = 地点リスト → section（トグル）→ section（代替カード。routes が 2 本以上）→ section（`StepList`）。section は `paddingTop 12` + 上罫線。

## `src/ui/edit/Settings.tsx`

props なし。`settings` モードで `App` が `Map` の上に描く全画面パネル（ui.md「設定画面」）。購読: saved store の `home` `iconOnly`。操作: 「戻る」→ `tripActions.backPressed`、「自宅を設定」/「変更」→ `tripActions.homeSetupEntered`、トグル → `savedActions.iconOnlyToggled(event.target.checked)`。

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

`compact` = ピーク行（選択経路）。表示は `format.ts`。2 行構成を `Main`（所要時間 20px 太字 + 距離 14px。代替カードでは先頭にラベル）と `Statistics`（細い道合計 > 0 なら `colors.narrow` 背景のチップ「`NarrowIcon` 細い道 x.x km」、0 なら `colors.ok` 色「細い道なし」/ 有料 x.x km（あれば）/ 「`TurnsIcon` 右左折 n 回」）で共有。`Statistics` は saved store の `iconOnly` を購読し、true なら 細い道チップ「`NarrowIcon` x.x km」（0 なら何も出さない）/ 有料 / 「`TurnsIcon` n 回」。文言を落とした `span` には `aria-label`（「細い道 1.2 km」「右左折 5 回」）。compact で `loading` か経路なしならスピナー +「探索中…」/「出発地と到着地を設定してください」。`compact=false` は代替カード（`routes.length < 2` なら null。`<button aria-pressed>`、`borderLeftWidth 4`、選択中は `borderColor: accent`）。

## `src/ui/edit/StepList.tsx`

```ts
type StepListProps = { route: RouteModel; narrow: NarrowSegment[] };
```

`instructions` を全部表示（`sign 0` 含む）。各行: `DirectionIcon` / `formatDistance(distance)` / `text` / `streetName`。`entersNarrow` が真なら先頭に「⚠ 細い道」（saved store の `iconOnly` が true なら `NarrowIcon size={14}` だけ、`aria-label`「細い道」）、行背景 `colors.narrowBackground`（`margin ±8` で本文の余白まで広げる）。行の上罫線は `:first-child` で消す（section の上罫線と重ねない）。

## `src/ui/navigation/NavigationHud.tsx`

props なし。navigation store の `navigation` `hud` `inNarrow`、trip store の `selectRoute` を購読。`navigation` か経路が無ければ描画しない。残り距離は `hud.remaining`、hud 未着なら `route.distance − navigation.s`。`hud.instruction` null → 「目的地まで」+ 残り距離。`hud.next` null なら「その先」行は空（高さ固定）。`navigation.rerouting` で「再探索中」。細い道バナーはアイコンのみ表示の対象外（常に文言あり）。

## `src/ui/navigation/NavigationBar.tsx`

props なし。navigation store の `navigation` `muted`、trip store の `selectRoute` `fix` を購読。`remainingMs = remainingTime(route, navigation.s)`、到着予想 = `formatClock(new Date(fix.timestamp + remainingMs))`（render 内で `Date.now` を呼ばない）。ボタン: 「現在地」→ `navigationActions.setFollow(true)`、ミュート → `toggleMute`、「終了」→ `end(true)`。

## `src/ui/icons/index.tsx`

```ts
export function FromIcon(props: { size?: number }): JSX.Element; // 出発地 = 丸
export function ToIcon(props: { size?: number }): JSX.Element; // 到着地 = ピン
export function HomeIcon(props: { size?: number }): JSX.Element; // 自宅マーカー・設定画面の自宅行
export function NarrowIcon(props: { size?: number }): JSX.Element; // 細い道 = 狭い道路線画。経路サマリ・HUD 細い道バナー
export function TurnsIcon(props: { size?: number }): JSX.Element; // 右左折 = 左右に分かれる T 字矢印。経路サマリ
export function VolumeIcon(props: { size?: number }): JSX.Element; // NavigationBar ミュートトグル（音声あり）
export function VolumeOffIcon(props: { size?: number }): JSX.Element; // 同（ミュート中）
export function DirectionIcon(props: { sign: number; size?: number }): JSX.Element;
```

同じディレクトリの `*.svg` を `import` し、`<span>` の `mask-image` に置いて `background-color: currentColor` で塗る。SVG 側は色を持たず、親の `color` に従う（ダークモード対応はトークン側）。

`DirectionIcon` の sign → 11 種（navigation.md）。矢印 `arrow.svg` 1 本を `rotate()` で回し、左向きは `scaleX(-1)`。`4` `5` は `pin-dot.svg`、`6` は `roundabout.svg`、`±8` `-98` は `uturn.svg`、`±7` は `keep.svg`。未知の sign は直進。

## `src/ui/Toast.tsx`

props なし。`useToast()` と `mode === "navigation"`（位置を HUD 下へ。`layout.hud + layout.next + 16px`）を購読。`useEffect([message])` で 4 秒後に `clearToast()`（新しいメッセージでタイマーを張り直す）。

## `src/ui/tokens.stylex.ts`

`defineVars` で色トークン `colors`（`background` `foreground` `surface` `border` `accent` `narrow` `narrowBackground` `ok` `danger`）。ライト値 + `@media (prefers-color-scheme: dark)` のダーク値。`narrowBackground` は細い道行の背景、`ok` は「細い道なし」の緑。経路線の色（青・オレンジ）は MapLibre 側なのでここに置かない。

`defineConsts` で `marker`（`from` 緑 / `via` 青 / `to` 赤。ライト / ダーク共通）。地図の DOM マーカーとボトムシートの地点リストで共有。

`defineConsts` で `fixedColors`（`onAccent` 色付き背景上の白文字 / `popupForeground` MapLibre ポップアップの文字。ライト / ダーク共通）と `shadows`（`card` `marker` `float` `up`）。

スタイルは値を複数並べる shorthand（`padding: "0 16px"` 等）を書かず、`paddingBlock` / `paddingInline` などの longhand で書く。StyleX は longhand を shorthand より優先するので、`button.base` の longhand を部品側の `padding: 0` で上書きできない。

## `src/ui/layout.stylex.ts`

```ts
export const layout = stylex.defineConsts({
  peek: 108,
  peekEmpty: 88,
  half: 75,
  navigationBar: 80,
  hud: 88,
  next: 36,
}); // px。half のみ vh
```

画面部品の高さ。`BottomSheet`（`peek` 収納時 / `half` 展開時）`NavigationBar` `NavigationHud` が自分の高さに使い、`Map` が fitBounds / ナビ時の padding、`Toast` がナビ時の `top` に使う。`defineConsts` の値はコンパイル時に文字列で埋まる。数値は単位なしのまま埋まる（vite dev では `max-height:80` が無効になる。build は lightningcss が px を補うので気づきにくい）ので、`stylex.create` 内では `${layout.peek}px` のように単位を付け、JS で足さず `calc()` に並べる。JS からは数値として読める。

## `src/App.tsx`

状態を持たない。`useGeolocation()` `useRouteSearch()` `useReverseGeocode()` `useUrlSync()` を呼び、`mode` を購読して `useWakeLock(mode === "navigation")` `useUpdateCheck(mode === "navigation")`。描画は `<Map />` + モード別: navigation → `<NavigationHud /> <NavigationBar />`、settings → `<Settings />`、edit / home → `<SearchBox key={mode} />` と edit のとき `<BottomSheet />`。末尾に `<Toast />`（Settings より上に重ねる）。

主要な流れ（どこで起きるか）:

- 起動: `store/trip.ts` のモジュール評価で `parseQuery(location.search)` → 地点（label null）。`store/saved.ts` が `localStorage` を読む。`useGeolocation` は即 watch。初回 fix で `from` が空なら `fixUpdated` が現在地を入れ、Map が `URL_HAD_POINTS` false なら `easeTo(zoom 15)`
- 探索: `useRouteSearch`（ui.md「状態」）。`routesLoaded` が `pointsKey` と `fittedKey` を比べて `fitVersion++`
- 逆ジオ: `useReverseGeocode` → `labelRequested`。重複排除と反映は store
- ナビ: `navigationActions.start` → fix ごとに `useGeolocation` が `navigationActions.onFix` → `dispatch`。リルート・終了・到着は `store/navigation.ts`
- 設定: `settingsEntered` → mode settings。Settings は saved store だけ読み書きする（`iconOnlyToggled`）。`backPressed` で edit
- 自宅設定: Settings の `homeSetupEntered` → mode home。`home` モードのタップは edit と同じく `popupOpened`。保存は `homeChosen` 1 箇所（`popupHomeTaken` と `searchPicked(ROLE.HOME, …)` から）→ mode settings。`backPressed` でも settings
- アイコンのみ表示: `RouteSummary`（`Statistics`）`StepList` が各自 `useSaved(state => state.iconOnly)` を購読。props で渡さない
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
