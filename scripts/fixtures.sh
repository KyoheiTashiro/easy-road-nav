#!/bin/sh
# GraphHopper 実応答を src/model/__fixtures__/ に保存する（Step 1）。serve 起動中に実行。
# 使い方: sh scripts/fixtures.sh
set -eu
GH=http://127.0.0.1:8989
OUT=src/model/__fixtures__

route() { # name profile alt points-json
  name=$1 profile=$2 alt=$3 points=$4
  if [ "$alt" = 1 ]; then
    algo='"algorithm":"alternative_route","alternative_route.max_paths":3,'
  else
    algo=''
  fi
  curl -sf -X POST "$GH/route" -H 'Content-Type: application/json' -d "{
    \"profile\":\"$profile\",\"points\":$points,\"points_encoded\":false,\"elevation\":false,
    \"instructions\":true,\"locale\":\"ja\",\"details\":[\"road_class\",\"toll\"],
    \"snap_preventions\":[\"tunnel\",\"bridge\",\"ferry\"],$algo\"ch.disable\":false}" > "$OUT/$name.json"
  jq -r --arg n "$name" '.paths | to_entries[] | "\($n)[\(.key)]: " + (.value | "\(.distance|floor) m, \(.time/60000|floor) min, classes=\([.details.road_class[][2]]|unique|join(",")), toll=\([.details.toll[][2]]|unique|join(",")), sign5=\([.instructions[]|select(.sign==5)]|length), inst=\(.instructions|length)")' "$OUT/$name.json"
}

echo "## info"; curl -sf "$GH/info" | jq -c '{version, profiles: [.profiles[].name], import_date}'
echo "## 1 narrow: 阿佐谷住宅街 → 吉祥寺駅（代替あり）"
route narrow car 1 '[[139.633,35.712],[139.5797,35.7045]]'
echo "## 2 via: 新宿駅 → 渋谷駅 → 品川駅"
route via car 0 '[[139.699,35.69],[139.7016,35.658],[139.7387,35.6285]]'
echo "## 3 toll: 東京駅 → 横浜駅（car）"
route toll car 1 '[[139.7671,35.6812],[139.6225,35.466]]'
echo "## 3b 同地点 car_notoll（fixture には保存しない比較用）"
route _notoll car_notoll 0 '[[139.7671,35.6812],[139.6225,35.466]]'
rm "$OUT/_notoll.json"
ls -la "$OUT"
