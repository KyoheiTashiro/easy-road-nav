#!/bin/sh
# GraphHopper serve のヒープ実測（Step 9）。serve 起動後に実行し、最後の docker stats で OOM なしを確認する。
#   docker compose up -d serve && sh scripts/heap-check.sh
set -eu
N=${1:-50}
# 関東の地点ペア（出発 → 到着）。fixture と同じ経路 + 長距離
PAIRS='139.633067,35.711956 139.580308,35.704204
139.76555,35.681021 139.623457,35.465994
139.698787,35.68998 139.737611,35.628481
139.6917,35.6895 140.1233,36.0834
139.3394,35.3406 140.4467,36.3418
139.0300,36.3900 140.0000,35.6000'
i=0
while [ "$i" -lt "$N" ]; do
  echo "$PAIRS" | while read -r a b; do
    for prof in car car_notoll; do
      code=$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8989/route -H 'Content-Type: application/json' \
        -d "{\"profile\":\"$prof\",\"points\":[[${a}],[${b}]],\"points_encoded\":false,\"instructions\":true,\"locale\":\"ja\",\"details\":[\"road_class\",\"toll\"],\"algorithm\":\"alternative_route\",\"alternative_route.max_paths\":3}")
      [ "$code" = 200 ] || echo "req $i $prof $a->$b: HTTP $code"
    done
  done
  i=$((i+1))
done
echo "--- $N 周完了。メモリ:"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.MemPerc}}' | grep serve || true
docker compose ps serve
