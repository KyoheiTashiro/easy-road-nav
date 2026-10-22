#!/bin/sh
# 関東甲信越 + 静岡の pbf を作る（docs/runbook.md 3 章）。
#   make pbf
# Geofabrik に県単位の pbf はないので、中部から山梨・長野・新潟・静岡を県境ポリゴンで切り出して関東と結合する。
# 県境は scripts/regions/*.geojson（Nominatim の admin 境界、polygon_threshold=0.0005 で簡略化）。
# -s smart: 境界をまたぐ way を切らずに丸ごと含める（関東側と接続を保つ）。
set -eu
cd "$(dirname "$0")/.."
command -v osmium >/dev/null || { echo "osmium-tool がない: brew install osmium-tool" >&2; exit 1; }
mkdir -p data
for r in kanto chubu; do
  curl -fL -o "data/$r-latest.osm.pbf" "https://download.geofabrik.de/asia/japan/$r-latest.osm.pbf"
done
# polygon の file_name は extract.json からの相対、出力先は -d
osmium extract -c scripts/regions/extract.json -d data -s smart --overwrite data/chubu-latest.osm.pbf
osmium merge --overwrite data/kanto-latest.osm.pbf data/yamanashi.osm.pbf data/nagano.osm.pbf data/niigata.osm.pbf data/shizuoka.osm.pbf -o data/kanto-koshinetsu.osm.pbf
rm -f data/kanto-latest.osm.pbf data/chubu-latest.osm.pbf data/yamanashi.osm.pbf data/nagano.osm.pbf data/niigata.osm.pbf data/shizuoka.osm.pbf
ls -la data/kanto-koshinetsu.osm.pbf
