# ローカル開発用。手順の詳細は docs/runbook.md
.PHONY: help dev build preview test check lint fmt up down logs import pbf fixtures heap-check

help: ## ターゲット一覧
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

# --- web ---
dev: up ## GraphHopper 起動 + vite dev（/gh → :8989 プロキシ）
	npm run dev

build: ## 型チェック + vite build
	npm run build

preview: build ## build 結果をローカル配信
	npm run preview

test: ## vitest
	npm test

check: ## typecheck + lint + test
	npm run typecheck && npm run lint && npm test

lint: ## oxlint
	npm run lint

fmt: ## oxfmt
	npm run fmt

# --- GraphHopper ---
up: ## serve 起動（:8989、graph-cache 必須）
	docker compose up -d serve

down: ## serve 停止
	docker compose --profile serve down

logs: ## serve ログ追従
	docker compose logs -f serve

import: ## graph-cache 再生成（pbf 必須、十数分）
	rm -rf data/graph-cache
	docker compose --profile import run --rm import

pbf: ## 関東 pbf を Geofabrik から取得
	mkdir -p data
	curl -fL -o data/kanto-latest.osm.pbf https://download.geofabrik.de/asia/japan/kanto-latest.osm.pbf

fixtures: ## GraphHopper 実応答を fixture に保存（serve 起動中）
	sh scripts/fixtures.sh

heap-check: ## serve のヒープ実測（serve 起動中）
	sh scripts/heap-check.sh
