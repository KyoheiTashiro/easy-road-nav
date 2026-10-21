# easy-road-nav 要件

Web で使える Google Maps ライクな地図・ナビアプリ。日本国内限定、自動車のみ。
運転初心者が迷わないよう「広い道」を優先して案内し、避けきれない「細い道」は地図・案内文で明示する。

自分用の小規模プロジェクト。スマホ・タブレットで使う。

## 用語

[CONTEXT.md](CONTEXT.md) — 「広い道」「細い道」の定義、調整値、プロファイル名

## 決定記録

- [ADR-0001 経路エンジンに GraphHopper（セルフホスト）を採用](adr/0001-routing-engine.md)
- [ADR-0002 施設名検索に Nominatim 公式インスタンスを採用](adr/0002-poi-geocoder.md)（廃止）
- [ADR-0003 施設名検索を Yahoo! ローカルサーチ API に切り替え](adr/0003-poi-geocoder-yahoo.md)

## 要件

- [道路分類](requirements/road-classification.md) — 判定ルール、データソース、既知の限界
- [経路探索](requirements/routing.md) — プロファイル、代替経路、経由地、有料道路
- [地図表示](requirements/map-display.md) — タイル、経路描画、案内文、サマリ、URL 共有
- [ナビゲーション](requirements/navigation.md) — 現在地追従、音声、細い道警告、リルート
- [地点検索](requirements/search.md) — 住所検索、施設名検索、地図タップ、逆ジオ、自宅、検索履歴
- [基盤](requirements/infrastructure.md) — 構成、GraphHopper 設定、公開、デプロイ、運用
- [フロント構成](requirements/frontend.md) — 方針、ディレクトリ、テスト

## 設計

- [UI](design/ui.md) — 画面モード、ボトムシート、設定画面、地点ポップアップ、探索トリガ、App の状態
- [ナビ](design/nav.md) — 開始手順、NavState、`step` の処理順、発話テンプレ、カメラ、リルート
- [経路モデル](design/route-model.md) — GraphHopper リクエスト/応答契約、内部構造、幾何計算
- [モジュール](design/modules.md) — `src/` 各ファイルの export・シグネチャ、分岐箇所の擬似コード、設定ファイル

## 手順書

- [runbook.md](runbook.md) — VPS 初期構築、デプロイ、データ更新、バージョン更新
- [vps-shared.md](vps-shared.md) — 同じ VPS に別アプリを載せるときの変更点（入口・メモリ・初期構築スクリプト）
