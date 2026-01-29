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

echo "== Nice-to-have devtools =="
command -v just >/dev/null && just --version || echo "MISSING: just"
command -v fzf >/dev/null && fzf --version | head -n 1 || echo "MISSING: fzf"
command -v fd >/dev/null && fd --version || echo "MISSING: fd"
command -v bat >/dev/null && bat --version || echo "MISSING: bat"

echo

echo "== Cloud / Infra =="
command -v aws >/dev/null && aws --version || echo "MISSING: aws"
command -v terraform >/dev/null && terraform version | head -n 1 || echo "MISSING: terraform"
command -v kubectl >/dev/null && kubectl version --client 2>/dev/null | head -n 1 || echo "MISSING: kubectl"

echo

echo "== Deploy =="
command -v vercel >/dev/null && vercel --version || echo "MISSING: vercel"
command -v pnpm >/dev/null && pnpm --version || echo "MISSING: pnpm"
command -v serve >/dev/null && serve --version || echo "MISSING: serve"

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
