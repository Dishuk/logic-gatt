# LogicGATT Makefile

# ── Setup ────────────────────────────────────────────────
.PHONY: setup install

setup: install

install:
	npm install
	cd shared && npm install
	cd backend && npm install
	cd frontend && npm install

# ── Build ────────────────────────────────────────────────
.PHONY: build build-shared build-backend build-frontend build-plugins copy-plugin-assets

build: build-shared build-plugins build-backend build-frontend copy-plugin-assets
	@echo "Build complete!"

build-shared:
	cd shared && npm run build

build-plugins: build-shared
	cd backend && npx tsc -b plugins

build-backend: build-shared build-plugins
	cd backend && npm run build

build-frontend:
	cd frontend && npm run build

# Copy plugin runtime assets (manifest.json, python/) to dist/plugins/
copy-plugin-assets:
	node backend/scripts/copy-plugin-assets.js

# ── Run ──────────────────────────────────────────────────
.PHONY: start dev dev-backend dev-frontend

start:
	cd backend && NODE_ENV=production node dist/index.js

dev:
	@echo "Run in separate terminals:"
	@echo "  make dev-backend   (http://localhost:3001)"
	@echo "  make dev-frontend  (http://localhost:5173)"

dev-backend:
	cd backend && npm run dev

dev-frontend:
	cd frontend && npm run dev

# ── Clean ────────────────────────────────────────────────
.PHONY: clean

clean:
	node backend/scripts/clean.js

# ── Help ─────────────────────────────────────────────────
.PHONY: help

help:
	@echo "LogicGATT Makefile"
	@echo ""
	@echo "Setup:"
	@echo "  make install           Install all dependencies (merges plugin deps)"
	@echo ""
	@echo "Build:"
	@echo "  make build             Build all packages"
	@echo "  make build-backend     Build backend only"
	@echo "  make build-frontend    Build frontend only"
	@echo "  make build-plugins     Build plugins only"
	@echo ""
	@echo "Run:"
	@echo "  make start             Start production server"
	@echo "  make dev-backend       Start backend dev server (port 3001)"
	@echo "  make dev-frontend      Start frontend dev server (port 5173)"
	@echo ""
	@echo "Clean:"
	@echo "  make clean             Clean all build artifacts"
