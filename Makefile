# ローカル開発用。pbf と import は Deploy graph workflow からも呼ぶ。手順の詳細は docs/runbook.md
.PHONY: help dev check up down logs import pbf fixtures heap-check

help: ## ターゲット一覧
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

# --- web（build / test / lint / fmt は npm run）---
dev: up ## GraphHopper 起動 + vite dev（/gh → :8989 プロキシ）
	npm run dev

check: ## typecheck + lint + test
	npm run typecheck && npm run lint && npm test

# --- GraphHopper ---
up: ## serve 起動（:8989、graph-cache 必須）
	docker compose up -d serve

down: ## serve 停止
	docker compose down

logs: ## serve ログ追従
	docker compose logs -f serve

import: ## graph-cache 再生成（pbf 必須、約 20 分）
	rm -rf data/graph-cache
	docker compose --profile import run --rm import

pbf: ## 関東甲信越 + 静岡 pbf を作る（Geofabrik 取得 + 県切り出し + 結合。osmium-tool 必須）
	sh scripts/build-pbf.sh

fixtures: ## GraphHopper 実応答を fixture に保存（serve 起動中）
	sh scripts/fixtures.sh

heap-check: ## serve のヒープ実測（serve 起動中）
	sh scripts/heap-check.sh
