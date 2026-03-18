# 00 — Atomic Structure (Branching Strategy)

## Branch Model
- `main`: stable / production-ready
- `develop`: integration branch for ongoing work (default target for feature PRs)

## Branch Types & Naming
- `feature/<slug>`: new product work (no numeric prefixes)
- `fix/<slug>`: non-urgent bug fixes (target `develop`)
- `hotfix/<slug>`: urgent production fixes (target `main`, then back-merge to `develop`)
- `chore/<slug>`: tooling, docs, refactors with no product behavior changes
- `release/<version>` (optional): stabilization branch used only when preparing a production release from `develop`

## PR & Merge Rules
- No direct commits to `main` (PR only).
- Small, atomic PRs aligned to a single `.maba/features/NN-*.md` guide.
- Feature PRs: `feature/*` → `develop`.
- Releases: `develop` → `main` via `release/*` (optional) or direct PR when stable.
- Hotfixes: `hotfix/*` → `main` then `main` → `develop`.

## Required Hygiene
- Each PR must include:
  - A short scope summary (what/why)
  - Verification notes (how it was tested)
  - Any schema/RLS migrations explicitly called out
