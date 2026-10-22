#!/bin/sh
# GraphHopper serve のヒープ実測（Step 9）。serve 起動後に実行し、最後の docker stats で OOM なしを確認する。
#   docker compose up -d serve && sh scripts/heap-check.sh
set -eu
N=${1:-50}
# 地点ペア（出発 → 到着）。関東: fixture と同じ経路 + 長距離。甲信越: 県境越え + 東京→新潟 300 km 超。静岡: 東京→浜松・静岡→甲府・静岡→長野
PAIRS='139.633067,35.711956 139.580308,35.704204
139.76555,35.681021 139.623457,35.465994
139.698787,35.68998 139.737611,35.628481
139.6917,35.6895 140.1233,36.0834
139.3394,35.3406 140.4467,36.3418
139.0300,36.3900 140.1063,35.6073
139.6917,35.6895 138.5684,35.6639
139.6917,35.6895 138.1812,36.6513
139.6917,35.6895 139.0232,37.9026
138.5684,35.6639 138.1812,36.6513
138.1812,36.6513 139.0232,37.9026
140.4467,36.3418 138.2529,36.2381
139.6917,35.6895 137.7261,34.7108
138.3828,34.9769 138.5684,35.6639
138.3828,34.9769 138.1812,36.6513'
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
