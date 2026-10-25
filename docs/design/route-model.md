# 経路モデル

GraphHopper 応答をフロント内部の 1 構造（経路モデル、型は `src/route/route.ts` の `RouteModel`）に変換し、細い道区間生成・描画分割・案内文・ナビ進捗のすべてがこれを入力にする。
fetch は `src/route/graphhopper.ts`、変換は `src/route/route.ts`。変換を React 非依存の `route.ts` に置くのは、GraphHopper 実応答の fixture でテストするため。

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

## 経路上の位置

経路上の位置はすべて「累積距離 s（m）」で表す。案内地点・細い道区間の開始・経由地・到着地は、いずれも頂点 index の累積距離に置き換えて比べる。

- 道路クラスは CONTEXT.md の分類表で広い道 / 細い道の 2 値に畳む。通行禁止（`track`）は custom model で priority 0 なので通常現れない。現れたら細い道
- 有料距離は `toll.value == "all"` の範囲の合計

## 分岐合成

GraphHopper は同格の分岐（高架下をくぐる vs 側道へ）で keep 指示を出さないことがある。そこで `intersection` から分岐を検出し、左寄り / 右寄りの指示を足す。

- `out` 以外に進入可能な道（`in` 除く）があり、`out` との方位差が「分岐判定角」以下なら分岐とみなす。他方が右にあれば左寄り、左なら右寄り
- そのノードに既に `sign != 0` の指示があれば足さない。ラウンドアバウトの周回中も足さない（周回中の出口を分岐と誤認する）。出発地（頂点 0）も対象外
- `sign 0` の指示がそのノードから始まるなら書き換え、指示の途中なら 2 つに分割する（`time` は距離比で配分）

## 幾何計算

`src/shared/geo.ts` に自前実装し、外部ライブラリは使わない（turf 不採用、[frontend.md](../requirements/frontend.md)）。最近傍点は局所平面近似で全線分を O(n) 走査する。1 Hz・経路 100 km 以下（頂点数千）なら足りる。遅ければ前回 index の近傍窓に絞る。

## 描画分割

道路クラスの範囲ごとに LineString を作り、広い道 / 細い道の 2 つの FeatureCollection にして MapLibre のレイヤーに渡す。短区間無視は描画には適用しない（CONTEXT.md）。

## テスト fixture

`src/route/__fixtures__/*.json` に GraphHopper 実応答を置く（関東の短経路 1〜2 本。細い道区間・経由地・有料区間を含む）。`narrow.ts` `progress.ts` `route.ts` のテスト入力。
