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

echo "== Project-local CLIs (no installs) =="
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

check_local_cli() {
  local name="$1"
  local executable="$project_root/node_modules/.bin/$name"
  if [[ ! -x "$executable" ]]; then
    echo "MISSING: project-local $name"
  elif ! "$executable" --version; then
    echo "WARN: project-local $name not runnable"
  fi
}

for cli in shadcn eslint next tsc; do
  check_local_cli "$cli"
done

