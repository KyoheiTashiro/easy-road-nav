#!/bin/sh
# web.new/ を web/ に入れ替える。VPS の /usr/local/sbin/easy-road-nav-swap-web に置く。
# web/ は root 所有にし、tailscale serve（root）が配信するツリーに deploy が symlink を置けないようにする。
# swap-graph.sh と同じく、root 所有の場所へコピーしてから symlink 等を拒否する。
set -eu
cd /srv/easy-road-nav
[ -d web.new ] || { echo "web.new がない" >&2; exit 1; }

rm -rf web.next
cp -RP web.new web.next
if [ -n "$(find web.next ! -type f ! -type d)" ]; then
  echo "web.new に通常のファイルとディレクトリ以外がある" >&2
  rm -rf web.next
  exit 1
fi

rm -rf web.old
[ ! -e web ] || mv web web.old
mv web.next web
rm -rf web.old
echo "web OK"
