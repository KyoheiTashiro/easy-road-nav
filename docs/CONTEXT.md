# CONTEXT.md — 用語集

このプロジェクトで使う用語の定義。要件・コード・UI で同じ語を使う。

## 道路分類

| 用語         | 定義                                                                               | OSM `highway=*`                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **広い道**   | 経路案内が優先して使う道。日本の OSM 定義で「センターラインあり・2車線以上」に相当 | `motorway` `motorway_link` `trunk` `trunk_link` `primary` `primary_link` `secondary` `secondary_link` `tertiary` `tertiary_link`                                                                      |
| **細い道**   | 原則として経路に含めない道。避けきれない場合のみ通り、地図・案内文で明示する       | `unclassified` `residential` `service` `living_street` `road`（分類不明）`busway`（GraphHopper 11 では独立値 `BUSWAY`）、および上記いずれにも該当しない値（GraphHopper `road_class == OTHER`）        |
| **通行禁止** | 経路に一切含めない道                                                               | `track`、フェリー航路（GraphHopper `road_environment == FERRY`）、および `surface` が未舗装系（GraphHopper `Surface` の `UNPAVED` `COMPACTED` `FINE_GRAVEL` `GRAVEL` `GROUND` `DIRT` `GRASS` `SAND`） |

- GraphHopper は `*_link` を親クラスに畳む（`motorway_link` → `MOTORWAY`）。既定の car モデルは track・フェリー・未舗装を禁止しないため custom model で明示する。
- 判定は `highway` クラスのみで行う。`lanes` / `width` は使わない（日本の付与率 1〜2%、判定材料にならない）。
- 「広い道」でも実際は1車線の区間（いわゆる険道）は存在する。v1 では許容する既知の限界。
- UI・案内文の表記は「広い道」「細い道」で統一。「幹線道路」「細街路」は使わない。

## 細い道区間

経路のうち、連続する「細い道」エッジをまとめた1区間。GraphHopper の `details=road_class` から生成する。

生成ルール（適用順: 結合 → 短区間無視。実装は `src/route/narrow.ts`）:

- 細い道区間の間に挟まる広い道が「区間結合」未満なら 1 区間に結合する
- 結合後、長さが「短区間無視」未満の区間は捨てる（地図描画のみ。警告の対象外）
- 通行禁止扱いのクラス（`track`）が経路に現れた場合は細い道として扱う
- 出発地に接する先頭区間は警告しない（既にそこにいる）
- 到着地に接する末尾区間は警告する（「この先細い道、目的地付近」）

## 調整値

実走で変わる前提の数値。値は置き場のファイルが正で、ここには書かない。フロントの値は使うファイルの先頭の定数、GraphHopper 側の値は custom model の `priority` / `speed`。

| 名前                   | 置き場                                  | 意味                                                                                                                                          |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 細い道ペナルティ       | `graphhopper/custom_models/wide.json`   | 細い道 1 km を広い道何 km 相当のコストとして扱うか（`priority` はその逆数）                                                                   |
| 有料ペナルティ         | `graphhopper/custom_models/notoll.json` | `car_notoll` で有料・高速 1 km を何 km 相当として扱うか（`priority` はその逆数）。禁止ではない                                                |
| 速度係数（高速）       | `graphhopper/custom_models/wide.json`   | `road_class == MOTORWAY` の速度に GraphHopper 既定から掛ける倍率。市街地判定を問わない                                                        |
| 速度係数（市街地）     | `graphhopper/custom_models/wide.json`   | 高速以外で `urban_density == CITY` の速度に掛ける倍率                                                                                         |
| 速度係数（住宅地）     | `graphhopper/custom_models/wide.json`   | 同 `RESIDENTIAL` に掛ける倍率                                                                                                                 |
| 速度係数（郊外）       | `graphhopper/custom_models/wide.json`   | 同 `RURAL` に掛ける倍率                                                                                                                       |
| 短区間無視             | `src/route/narrow.ts`                   | これ未満の細い道は「細い道区間」にしない                                                                                                      |
| 区間結合               | `src/route/narrow.ts`                   | 細い道区間の間の広い道がこれ未満なら結合                                                                                                      |
| 経路外れ距離           | `src/navigation/progress.ts`            | 現在地が経路線からこの距離を超えたらリルート候補                                                                                              |
| リルート連続回数       | `src/navigation/progress.ts`            | 経路外れが連続この回数（かつ GPS 精度が進捗採用精度未満、移動中の fix のみ）でリルート実行                                                    |
| リルート前方オフセット | `src/navigation/progress.ts`            | リルート時の出発地を現在地から進行方向へこの距離ずらす（U ターン指示防止）                                                                    |
| 進捗採用精度           | `src/navigation/progress.ts`            | GPS `accuracy` がこれ以上の fix は進捗・案内・経路外れ判定に使わない（マーカー位置のみ更新）                                                  |
| 到着判定               | `src/navigation/progress.ts`            | 到着地まで残りこの距離未満で「到着」、ナビ終了                                                                                                |
| 案内トリガー距離       | `src/navigation/progress.ts`            | 案内地点の手前で予告する距離と、直前案内する距離の 2 つ                                                                                       |
| 細い道警告距離         | `src/navigation/progress.ts`            | 細い道区間のこの距離手前で画面・音声警告                                                                                                      |
| 進捗探索範囲           | `src/navigation/progress.ts`            | 現在地に最も近い経路上の点を、進捗 s からこの距離先までに絞って探す。往復する経路で帰り側へ飛ばないため。範囲内で経路外れなら経路全体から探す |
| 方位算出最小移動       | `src/navigation/progress.ts`            | 直近 2 fix から進行方向を求めるとき、fix 間の移動がこれ以上の場合のみ更新。未満は直前値を保持                                                 |
| 次の次表示上限         | `src/navigation/progress.ts`            | 次の案内地点から次の次の案内地点までがこれ以内なら HUD に「その先」行を出す。超えたら行は空                                                   |
| 検索履歴件数           | `src/settings/saved.ts`                 | 入力欄が空のとき候補に出す過去の検索地点の数。同じ座標は 1 件にまとめる                                                                       |
| 分岐判定角             | `src/route/route.ts`                    | 交差点で進む道と別の進入可能な道の方位差がこれ以下なら分岐とみなし「右寄り/左寄り」を合成                                                     |

速度係数の根拠は [requirements/routing.md](requirements/routing.md)「所要時間」。GraphHopper custom model の `speed` で掛けるため、変更には再インポートが要る（[runbook.md](runbook.md) 3 章）。

## 市街地判定

GraphHopper が取り込み時に道路密度から各エッジへ付ける 3 値（encoded value `urban_density`）。`city`（市街地）> `residential`（住宅地）> `rural`（郊外）。速度係数の切り替えにだけ使い、地図・案内文には出さない。

## 経路モデル

GraphHopper 応答をフロント内部で扱う 1 構造。頂点配列・各頂点の累積距離・道路クラス範囲を持ち、細い道区間・描画・案内・ナビ進捗の共通入力。経路上の位置は「累積距離 s（m）」で表す。定義は [design/route-model.md](design/route-model.md)。

## プロファイル

GraphHopper のルーティング設定単位。v1 は2つ。

- `car`: 広い道優先。高速・有料道路を使う
- `car_notoll`: `car` + 高速・有料道路にペナルティ（有料ペナルティ）

## 地点

- **出発地 / 到着地 / 経由地**: ユーザーが指定する地点。指定方法は住所検索・地図タップ・現在地
- **経由地**は最大5。経由地ありの経路では代替経路を出さない（GraphHopper 制約）
- **自宅**: 端末に 1 件だけ登録する地点。出発地・到着地の入力欄が空のとき候補の先頭に出す。登録・変更は自宅設定画面（[design/ui.md](design/ui.md)）で行う
- **検索履歴**: 住所検索・施設名検索の候補をタップして地点にした記録。新しい順に「検索履歴件数」まで端末に保存し、入力欄が空のとき自宅の下に出す
