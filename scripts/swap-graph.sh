#!/bin/sh
# data/graph-cache.new と graphhopper.new/ を serve に入れ替える。VPS の /usr/local/sbin/easy-road-nav-swap-graph に置く。
# compose.yml は deploy から受け取らず main から取る。deploy が書き換えられると root で任意のコンテナを起動できるため。
# graphhopper.new/ は root 所有の graphhopper/ へコピーしてから symlink を拒否する。bind mount 元の symlink はホスト側でたどられるため。
# コピーしてから検査するのは、検査後に deploy が中身を差し替えられないようにするため。
# /info が返らなければ compose.yml・graphhopper/・graph-cache をまとめて戻す。
set -eu
SELF=/usr/local/sbin/easy-road-nav-swap-graph
LOG=/var/log/easy-road-nav-swap-graph.log

# ssh が切れても途中で止まらないよう、一時ユニットとして自分を動かし直す。ユニット名が固定なので同時実行もしない。
# systemd-run は環境変数を引き継がず、ユニット内では systemd が INVOCATION_ID を入れる。
if [ -z "${INVOCATION_ID:-}" ]; then
  status=0
  systemd-run --quiet --wait --collect --unit=easy-road-nav-swap-graph \
    -p StandardOutput=truncate:$LOG -p StandardError=inherit "$SELF" || status=$?
  cat $LOG
  exit $status
fi

cd /srv/easy-road-nav
[ -d data/graph-cache.new ] || { echo "data/graph-cache.new がない" >&2; exit 1; }
[ -d graphhopper.new ] || { echo "graphhopper.new がない" >&2; exit 1; }

rm -rf graphhopper.next
cp -RP graphhopper.new graphhopper.next
if [ -n "$(find graphhopper.next ! -type f ! -type d)" ]; then
  echo "graphhopper.new に通常のファイルとディレクトリ以外がある" >&2
  rm -rf graphhopper.next
  exit 1
fi

# main という名前で取ると CDN のキャッシュで古い内容が返ることがあるので、コミットを指定して取る。
commit=$(git ls-remote https://github.com/KyoheiTashiro/easy-road-nav.git refs/heads/main | cut -f1)
[ -n "$commit" ] || { echo "main のコミットが取れない" >&2; exit 1; }
curl -fsSL -o compose.yml.next "https://raw.githubusercontent.com/KyoheiTashiro/easy-road-nav/$commit/compose.yml"

docker compose down
# down は compose ファイルにないサービス（profile 付き等）を無言で飛ばす。止まっていなければ旧プロセスが旧 graph-cache を掴んだままになる
if [ -n "$(docker ps -q --filter label=com.docker.compose.project=easy-road-nav)" ]; then
  echo "serve が止まっていない: docker compose down の対象になっていない" >&2
  exit 1
fi
for path in compose.yml graphhopper data/graph-cache; do
  rm -rf "$path.old"
  [ ! -e "$path" ] || mv "$path" "$path.old"
done
mv compose.yml.next compose.yml
mv graphhopper.next graphhopper
mv data/graph-cache.new data/graph-cache
docker compose up -d serve
for i in $(seq 1 30); do
  sleep 2
  if curl -sf localhost:8989/info >/dev/null; then
    echo "serve OK ($commit)"
    rm -rf compose.yml.old graphhopper.old data/graph-cache.old
    exit 0
  fi
done
echo "serve NG: compose.yml・graphhopper/・graph-cache を戻す" >&2
docker compose down
for path in compose.yml graphhopper data/graph-cache; do
  [ ! -e "$path.old" ] || { rm -rf "$path"; mv "$path.old" "$path"; }
done
docker compose up -d serve
exit 1
