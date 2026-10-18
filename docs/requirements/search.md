# 地点検索

## 住所検索

- 国土地理院 住所検索 API（`msearch.gsi.go.jp/address-search/AddressSearch?q=`）
- 出発地・到着地の入力欄に住所を入れ、候補リストから選択するとその役割に直接セット。施設名検索は対象外
- 経由地は地図タップで指定（入力欄なし）
- 日本国外の結果は出ない（API 仕様）

## 地図タップ

- 地図をタップ（MapLibre `click`）で地点を置く。長押しは使わない
- 逆ジオコーディング: 国土地理院 逆ジオ API（`mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress`）で市区町村 + 町字を表示。番地までは出ない

## 現在地

- 出発地の既定は現在地（起動後の初回 fix。URL 指定があればそちら）
- 出発地欄の候補「現在地」で再度セットできる（[navigation.md](navigation.md) の Geolocation を共用）

## v1 に含めない

- 施設名・POI 検索
- 検索履歴
