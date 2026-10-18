# 地点検索

## 住所検索

- 国土地理院 住所検索 API（`msearch.gsi.go.jp/address-search/AddressSearch?q=`）
- 出発地・到着地の入力欄に住所を入れ、候補リストから選択するとその役割に直接セット。施設名検索は対象外
- 経由地は地図タップで指定（入力欄なし）
- 日本国外の結果は出ない（API 仕様）
- API は住所データ主体。駅・施設は末尾に少数混ざる程度で、「東逗子」のような駅名は町名が別（沼間）なので住所としては当たらない。施設名は下の施設名検索で引く

## 施設名検索

- Nominatim 公式インスタンス（`nominatim.openstreetmap.org/search`、OSM データ）。駅・店・公園などの名称で引ける
- 入力欄で Enter（ソフトキーボードの「検索」）を押したときだけ呼ぶ。入力中の候補は住所検索のみ。Nominatim の利用規約がオートコンプリート用途を禁じているため
- 結果は住所検索の候補と同じリストに出す。候補タップで役割にセット
- 0 件のときはトースト「施設が見つかりません」。失敗はトースト「施設検索に失敗しました」
- 利用規約（[Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)）で守る点
  - 1 リクエスト/秒以下。アプリ側で前回から 1 秒空ける
  - リクエスト元の識別。ブラウザが送る `Referer`（公開ドメイン）で満たす。`User-Agent` はブラウザから変更できない
  - 帰属表示「© OpenStreetMap contributors」を候補リスト末尾に出す
- 既知の限界: 表記ゆれ・かな入力に弱い（「ひがしずし」は当たらない）。公式インスタンスの停止・規約変更で使えなくなる可能性がある。自分用なので許容し、代替は地図タップ

## 地図タップ

- 地図をタップ（MapLibre `click`）で地点を置く。長押しは使わない
- 逆ジオコーディング: 国土地理院 逆ジオ API（`mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress`）で市区町村 + 町字を表示。番地までは出ない

## 現在地

- 出発地の既定は現在地（起動後の初回 fix。URL 指定があればそちら）
- 出発地欄の候補「現在地」で再度セットできる（[navigation.md](navigation.md) の Geolocation を共用）

## v1 に含めない

- 検索履歴
