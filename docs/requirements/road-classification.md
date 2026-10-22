# 道路分類

用語定義は [CONTEXT.md](../CONTEXT.md) を正とする。ここでは判定の仕様のみ。

## 判定ルール

- 入力: OSM way の `highway` と `surface`
- 判定は `highway` クラスのみ（CONTEXT.md の表）。`lanes` / `width` / `yh:WIDTH` は参照しない
- `track`、フェリー航路、および未舗装 `surface` は通行禁止（集合は CONTEXT.md）
- `highway=road`（分類不明）は細い道扱い

## 採用しなかった案（再検討の条件つき）

- **クラス + lanes/width 上書き**: 日本の付与率が unclassified/residential で 1〜2%、`width` 0.4%。効く区間が少なすぎる。`lanes=1` は一方通行と1.5車線対面の区別がつかない。→ 「広い道なのに細い」苦情が具体的な区間で出たら、tertiary 以上を降格する片方向だけ検討
- **国土数値情報 N13 幅員区分の空間結合**: CC BY 4.0 で公式幅員が取れるが、中心線マッチング自前実装・位置ズレ 3〜7 m・更新周期ズレ。→ 上記上書き案でも足りない場合のみ

## データソース

- OSM pbf（Geofabrik）。v1 は `kanto-koshinetsu.osm.pbf`（関東 1 都 6 県 + 山梨・長野・新潟・静岡。作り方は [infrastructure.md](infrastructure.md)「開発環境」）、全国化は `japan-latest.osm.pbf`（[infrastructure.md](infrastructure.md)）。日本国内限定はデータ範囲で担保する
- 日本の `highway` 付与慣行（JA:Japan tagging）: trunk=国道、primary=主要地方道、secondary=一般都道府県道、tertiary=センターラインあり2車線の市町村道、unclassified=1.5車線以下の市町村道、residential=住宅街
- 既知の限界: 険道（1車線の県道）は広い道扱いになる。Yahoo/ALPS インポート由来の道路は幅員で機械分類されており、都市部より地方で精度が良い傾向
