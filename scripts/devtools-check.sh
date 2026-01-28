#!/usr/bin/env bash
set -euo pipefail

echo "== System tools =="
command -v git >/dev/null && git --version
command -v gh >/dev/null && gh --version | head -n 2
command -v docker >/dev/null && docker --version
command -v jq >/dev/null && jq --version
command -v rg >/dev/null && rg --version | head -n 2
command -v psql >/dev/null && psql --version

echo

echo "== Supabase CLI =="
if command -v supabase >/dev/null; then
  supabase --version
else
  echo "MISSING: supabase"
fi

echo

echo "== Node toolchain =="
node -v
npm -v

echo

echo "== Project-local CLIs (via npx) =="
# These should never require global installs.
(npx --yes shadcn@latest --version) 2>/dev/null || echo "WARN: shadcn@latest not runnable"
(npx --yes eslint --version) 2>/dev/null || echo "WARN: eslint not runnable"
(npx --yes next --version) 2>/dev/null || echo "WARN: next not runnable"
(npx --yes tsc --version) 2>/dev/null || echo "WARN: tsc not runnable"
