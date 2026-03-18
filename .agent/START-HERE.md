# Start Here

## If you are a new agent/AI
1. Read `.maba/PROJECT-OVERVIEW.md` (source of truth: product + decisions).
2. Read `.maba/00-ATOMIC-STRUCTURE.md` (branching strategy).
3. Use `.maba/checklist.md` to pick the next branch to implement.
4. Follow the matching branch guide in `.maba/features/*`.
5. Use `.maba/ram.md` as the shared state log (append-only journal).

## Notes
- v1 scope is Molave-only UI, but all data and access must be tenant-aware from day 1.
- The repo is already scaffolded as a Next.js app at the repo root; `.maba/` is the planning system.
