UV ?= uv
PYTHON ?= $(UV) run python

.PHONY: dev setup

# 一次启动本地前后端；首次运行时补齐前端依赖。
dev:
	@test -d frontend/node_modules || (cd frontend && npm ci)
	$(PYTHON) scripts/dev.py

# 安装或更新锁文件中的前后端依赖。
setup:
	$(UV) sync
	cd frontend && npm ci
