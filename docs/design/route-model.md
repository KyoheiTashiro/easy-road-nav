# 経路モデル

GraphHopper 応答をフロント内部の 1 構造（経路モデル）に変換し、細い道区間生成・描画分割・案内文・ナビ進捗のすべてがこれを入力にする。
fetch は `src/route/graphhopper.ts`、変換（`fromGraphHopperPath`）・構造・計算は `src/route/route.ts`（fixture でテストするため変換も React 非依存の `route.ts` に置く。シグネチャは [modules.md](modules.md)）。

## リクエスト契約

`POST /gh/route`（JSON）。固定パラメータ:

- `profile`: `car` | `car_notoll`（[routing.md](../requirements/routing.md)）
- `points`: `[lng, lat]` の配列。出発地 → 経由地（順） → 到着地
- `points_encoded: false` — 座標配列がそのまま返る。デコーダ不要、MapLibre へ直渡し
- `elevation: false`
- `instructions: true`, `locale: "ja"`
- `details: ["road_class", "toll", "intersection"]`
- `snap_preventions: ["tunnel", "bridge", "ferry"]`
- `algorithm: "alternative_route"`, `alternative_route.max_paths: 3` — 経由地なしのときのみ。経由地ありは省略（最短 1 本）
- CH 有効のため `heading` `pass_through` `custom_model` `ch.disable` は送らない

## 応答の読み方

`paths[]` の各要素（代替経路は複数要素）:

- `points.coordinates`: `[lng, lat][]`。以下「頂点配列 P」、長さ n
- `distance`（m）, `time`（ms）
- `instructions[]`: `{ text, distance, time, sign, street_name, interval: [from, to] }`。`interval` は P の index 範囲。隣接する指示は端点を共有する（前の `to` = 次の `from`）
- `details.road_class`: `[from, to, "residential"][]`（値は小文字。custom model の `RESIDENTIAL` と異なる、実応答で確認済み）。P の index 範囲、隣接範囲は端点を共有、経路全体を隙間なく覆う
- `details.toll`: 同形式。値は `no` | `all` | `hgv`（小文字）
- `details.intersection`: `[from, to, { bearings, entries, in, out }][]`。頂点 `from` にある交差点の全接続エッジ。`bearings` は交差点から見た方位（昇順）、`entries[i]` は進入可能か（一方通行の逆走は false）、`in` / `out` は来た道・進む道の index（`in` は先頭ノードに無い）。経路の全ノード分（通過点含む）返る
- `sign == 5`（経由地到達）の指示の `from` が経由地の頂点 index（`interval` は `[k, k]`）。`locale=ja` の `text` は「1で降りる」と不自然（GraphHopper 11 の翻訳）。フロントで「経由地 n」に差し替える

エラー応答は HTTP 400（`message` に `Cannot find point`（地点が道路に吸着できない）、`Connection between locations not found`（経路なし））、またはネットワーク不達。いずれもトースト 1 種で通知、リトライなし。

## 経路モデル（内部構造）

```ts
type RouteModel = {
  points: [number, number][]; // P
  cumulativeDistances: number[]; // cumulativeDistances[k] = P[0]..P[k] の累積距離 m。cumulativeDistances[0] = 0、cumulativeDistances[n-1] = 総距離
  roadClass: { from: number; to: number; kind: "wide" | "narrow" | "forbidden" }[];
  toll: { from: number; to: number; value: "no" | "all" | "hgv" }[];
  instructions: {
    text: string;
    sign: number;
    streetName: string;
    from: number;
    to: number;
    time: number;
    exitNumber?: number;
  }[]; // time ms（残り時間算出）、exitNumber は sign 6 のみ
  viaIndices: number[]; // 経由地の頂点 index（sign == 5 の from）
  distance: number; // m
  time: number; // ms
};
```

- `kind` は CONTEXT.md の分類表で `road_class` 文字列から決める。`forbidden` は custom model で priority 0 なので通常現れないが型として持つ
- 経路上の位置はすべて「累積距離 s（m）」で表す。案内地点 = `cumulativeDistances[instruction.from]`、細い道区間開始 = `cumulativeDistances[segment.from]`、経由地 = `cumulativeDistances[viaIndex]`、到着地 = `cumulativeDistances[n-1]`
- 分岐合成（`forkSign` / `addFork`）: GraphHopper は同格の分岐（高架下をくぐる vs 側道へ）で keep 指示を出さないことがある。`intersection` の各ノードで、`out` 以外に進入可能な道（`in` 除く）があり `out` との方位差が「分岐判定角」以下なら分岐。他方が右にあれば `-7`（左寄り）、左なら `7`（右寄り）。そのノードに既に `sign != 0` の指示があれば何もしない。`sign 0` の指示がそこから始まるなら sign・text を書き換え、指示の途中なら 2 つに分割（`time` は距離比で配分）。出発地（頂点 0）は対象外
- 派生値: 細い道区間（`src/route/narrow.ts`、CONTEXT.md「細い道区間」の生成ルール）、有料距離（`toll.value == "all"` の範囲の `cumulativeDistances[to] - cumulativeDistances[from]` 合計）

## 幾何計算（`src/shared/geo.ts`）

自前実装、外部ライブラリなし。

- 距離: haversine
- 方位: 2 点間の initial bearing（deg、北 0・時計回り）
- 最近傍点: 各線分へ局所平面近似（x = Δlng·cos(lat)、y = Δlat をメートル換算）で射影し、最短距離の線分を採用。全線分 O(n) 走査。1 Hz・経路 100 km 以下（頂点数千）で十分。ponytail: 遅ければ前回 index の近傍窓に限定
- 進捗 s = `cumulativeDistances[i]` + 線分 i 内の射影距離。返り値は `{ s, distanceToRoute, segmentIndex }`

## 描画分割

`roadClass` の各範囲を LineString にし、`kind` ごとに FeatureCollection を 2 つ（広い道 / 細い道）作って MapLibre のレイヤーに渡す。短区間無視は描画には適用しない（CONTEXT.md）。

## 案内文と細い道の対応

細い道区間 `[from, to]` の `from` を `interval` に含む指示の先頭に「⚠ 細い道」（[map-display.md](../requirements/map-display.md)）。

## テスト fixture

`src/route/__fixtures__/*.json` に GraphHopper 実応答（関東の短経路 1〜2 本、細い道区間・経由地・有料区間を含むもの）。`narrow.ts` `progress.ts` `route.ts` のテスト入力。
