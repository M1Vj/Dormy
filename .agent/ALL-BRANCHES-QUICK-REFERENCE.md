# All Branches — Quick Reference

- `feature/foundation`: Base app setup, shadcn/ui, theming, layout, navigation, conventions.
- `feature/database`: Supabase schema + migrations + RLS (tenant-aware, Molave v1).
- `feature/auth-rbac`: Admin-provisioned auth, roles, route protection, user management.
- `feature/dorms-tenancy`: Dorm (tenant) management scaffolding (Molave-only UI in v1).
- `feature/occupants-rooms`: Occupant roster, rooms/levels model, assignments, lifecycle.
- `feature/fines`: Fine rules catalog + fine issuance + searchable ledger + balances/points.
- `feature/payments-clearance`: Payments, 3-ledger separation, reconciliation, clearance status.
- `feature/evaluation`: Dynamic metrics/weights, rating flows, rankings/top 30% retention outputs.
- `feature/events-core`: Calendar + events CRUD + photos + event ratings/comments.
- `feature/events-competition`: Teams, scoring, rankings (competition mode).
- `feature/export-xlsx`: Excel exports for fines/ledgers/evaluations.
- `feature/ai-voice`: Voice-to-structured text + Google Gemini helpers (guardrailed).
- `feature/audit-log`: Audit trails for money/role-sensitive actions + activity feed.
- `feature/cleaning-schedule`: Cleaning areas, rotations, rest-week support (Molave rules).
- `feature/contribution-finance-suite`: Contribution-centric finance workflows (batch creation, multi-pay, receipt composer, grouped contribution expenses, semester-aware reporting).
