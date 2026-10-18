# 経路探索

## エンジン

GraphHopper セルフホスト（[ADR-0001](../adr/0001-routing-engine.md)）。

## プロファイル

サーバ設定に固定、CH 有効。

- `car`: 広い道優先。高速・有料道路を使う
- `car_notoll`: `car` + `toll == ALL || road_class == MOTORWAY` → `priority` 0.1（有料ペナルティ、CONTEXT.md 調整値）。`toll == HGV` は大型車のみ有料なので対象外。禁止ではなく回避

custom model の骨子（両プロファイル共通部分）:

- `road_class == UNCLASSIFIED || RESIDENTIAL || SERVICE || LIVING_STREET || ROAD || BUSWAY || OTHER` → `priority` を 0.2 倍（細い道ペナルティ N=5、CONTEXT.md 調整値）。`OTHER` は enum 外の `highway` 値。禁止にすると到達不能の穴になるので細い道扱い。`BUSWAY` は GraphHopper 11 で独立値
- `road_class == TRACK` → `priority` 0（通行禁止）
- `road_environment == FERRY` → `priority` 0（既定 car モデルはフェリーを通す）
- `surface` が未舗装系（CONTEXT.md の集合）→ `priority` 0
- 既定 car モデル（`distance_influence` 90、`!car_access` → 0、速度式）はそのまま継承

`graph.encoded_values` に `road_class` `road_class_link` `road_environment` `surface` `toll` を明示（`surface` `toll` は既定リストに無い）。加えて内蔵 `car.json` が要求する `car_access` `car_average_speed` `road_access`（GraphHopper 11 は custom model 参照値を自動追加しない）。

ターンコスト: 両プロファイルで `turn_costs: { vehicle_types: [motorcar, motor_vehicle], u_turn_costs: 60 }`。OSM の右左折禁止 relation を守り、経路途中の U ターンにコストを乗せる。CH は edge-based になり graph-cache が 1.5〜2 倍・インポート時間増（[infrastructure.md](infrastructure.md)）。edge-based CH でも `alternative_route` は動く（GraphHopper `AlternativeRouteEdgeCH`）。

## 探索の挙動

- 細い道は強いペナルティで避ける。到達に必要なら通る（禁止ではない）。出発地・到着地付近の細い道は通常発生する
- 経路応答は `details=road_class,toll` を必ず要求し、区間クラス・有料区間をフロントへ渡す
- `snap_preventions=[tunnel, bridge, ferry]` を固定送信（タップ地点が高架・トンネル・航路に吸着するのを防ぐ。`motorway` は含めない: 高速上からのリルートがある）
- 案内文は GraphHopper の `locale=ja` を使う
- リクエストの固定パラメータ一覧・応答の読み方・内部構造は [route-model.md](../design/route-model.md)
- 失敗（地点が道路に吸着できない・経路なし・サーバ不達）はトースト 1 種で通知。リトライなし
- CH 有効のため `heading` `pass_through` `custom_model` はリクエストで使えない。リルート時の U ターン防止はフロント側の前方オフセットで対応（[navigation.md](navigation.md)）

## 地点

- 出発地 / 到着地 必須。経由地 0〜5
- 指定方法: 住所検索、地図タップ、現在地（[search.md](search.md)）

## 代替経路

- 経由地なしのとき最大3本（本線 + 代替2）。GraphHopper `algorithm=alternative_route`
- 各候補に 距離 / 所要時間 を並べて表示。並び順はエンジンの返却順
- 経由地ありのときは代替経路なし

## 有料道路

- 「高速・有料を避ける」トグル1個。OFF が既定（`car`）、ON で `car_notoll`
- リルート時も同じトグル状態を使う
- 回避 ON でも到達に必要なら有料区間を通る。通った場合はサマリに「有料区間 x.x km」を表示（`details=toll` の `all` 区間合計（応答値は小文字））

## v1 に含めない

- 徒歩・自転車
- 到着時刻指定、渋滞考慮
- 経路の保存
