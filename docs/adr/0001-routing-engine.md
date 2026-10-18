# ADR-0001: 経路エンジンに GraphHopper（セルフホスト）を採用

- 日付: 2026-09-25
- 状態: 採用

## 背景

要件は「広い道を優先し、避けきれない細い道区間を地図・案内文で明示する」。
エンジンに必要な能力は2つ。

1. OSM `highway` クラス単位でペナルティを設定できる
2. 経路応答に区間ごとの道路クラスが含まれる

## 検討した選択肢

- **GraphHopper**（Apache 2.0）: custom model JSON で `road_class` 条件のペナルティ、`details=road_class` で区間クラスを1リクエストで取得。日本全国で RAM 8〜16GB 目安
- **Valhalla**（MIT）: クエリ時動的コスティングは可だが、residential/unclassified を個別に下げるノブが無く C++ 改造が必要。区間属性は `trace_attributes` の2回呼び
- **OSRM**（BSD-2）: Lua でペナルティは容易だが、応答に道路クラスが出ない（既知制限 #5221）。プロファイル変更ごとに全再構築
- **商用 API**: Google / Mapbox / HERE に細い道回避なし。ZENRIN は要件一致だが法人限定・初期36万円+月6万円〜。NAVITIME は `wide=more_use` あるが区間種別を返さない

## 決定

GraphHopper をセルフホストする。理由: 上記2能力を標準機能だけで満たす唯一の選択肢。

- プロファイルはサーバ設定に固定（`car` / `car_notoll`）、CH（Contraction Hierarchies）を有効化して高速応答
- ペナルティ変更時は設定変更 → 再起動 → CH 再計算（十数分）を許容する
- flexible モード（クエリ時 `custom_model`）は使わない。調整の頻度は低い想定
- CH の制約: `heading` `pass_through` `custom_model` はリクエストで使えない。`snap_preventions` `alternative_route` `details` は使える。リルート時の進行方向はフロント側の前方オフセットで代替する

## 影響

- 運用者がサーバを持つ。開発は Mac ローカル Docker。公開先は VPS + Tailscale（[infrastructure.md](../requirements/infrastructure.md)）
- 日本全国の graph-cache 構築は Mac で行い、公開サーバへ転送する運用
- エンジン差し替え時は `details=road_class` 相当の区間属性取得を再設計する必要がある
