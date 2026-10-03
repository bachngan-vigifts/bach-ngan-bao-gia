# VIGIFTS CRM migration specification

Updated: 2026-09-24

## Source of truth

- AppSheet application: `ad0117e6-9c42-465a-bdfa-b31e90b35248`.
- Structured export: `reports/vigifts-appsheet-inventory.json`.
- Human-readable inventory: `reports/vigifts-appsheet-inventory.md`.
- Imported production mirror: 26 operational tables, 18,046 rows, 148 views, 219 actions, and 33 bots.
- The inventory contains 77 AppSheet table definitions because bot process tables and output tables are included. These are implementation artifacts, not all user-facing modules.

## Fixed implementation stack

- Vinext/React page hosted by OpenAI Sites.
- Cloudflare Worker API in `worker/index.ts`.
- D1 mirror storage in `vigifts_appsheet_*` tables.
- Existing staff session and roles: `manager`, `employee`, and `supplier`.
- The migration keeps AppSheet field names in `values_json` so imported data and rewritten modules can coexist during the transition.

## Module order and acceptance criteria

1. **KhachHang** — complete in V560.
   - Search, list, detail, create, edit, validation, unique tax code, generated customer code, pending approval, manager approval, and manager delete.
   - Existing imported rows stay readable; updates preserve the AppSheet tuple key and raw source payload.
2. **Người liên hệ** — next implementation.
   - Search, list, detail, create, edit, manager delete, phone and email actions.
   - A contact must reference an existing customer; the API stores the reference as an AppSheet-compatible tuple object.
3. **Giao dịch**.
   - Customer/contact references, type and outcome, follow-up date, owner, notes, sales value, and overdue calculation.
   - Reproduce the AppSheet rule that limits daily creation after day 25 of the month.
4. **Báo giá + Chi tiết báo giá**.
   - Header/line workflow, calculations, discounts, VAT totals, approval states, document output, and contract generation handoff.
5. **HĐKT + Chi tiết đơn hàng**.
   - Approval, delivery state, cost/profit controls, payments, invoice state, contract document generation, and manager-only finance fields.
6. **Sổ thu chi / Công nợ / Chi phí**.
   - Payment allocation, remaining balance, due/overdue slices, cash accounts, and reconciliation.
7. **Sản phẩm / Nhà cung cấp / Xưởng gia công**.
   - Product approval, prices, supplier references, production partners, and image handling.
8. **Task / Nhắc hẹn / KPI / reports**.
   - Today dashboard, reminders, task completion, KPI month locking, revenue, profit, and contribution views.

Each module must pass API lifecycle tests, a production build, and a live UI inspection before the next module is considered complete.

## Rewritten AppSheet behavior

- `Initial value` becomes server-side defaults so values cannot be bypassed by a modified browser request.
- `App formula` becomes a server calculation for stored results or a read calculation for derived values.
- `Valid_If` and `Required_If` become API validation, with matching form hints for usability.
- `Show_If` becomes role/state-driven rendering while the API enforces the same permission.
- References are stored by tuple ID and resolved to labels for the UI.
- AppSheet slices become named API filters and dashboard panels.
- Data-changing actions become authenticated API routes. Destructive actions retain confirmation and manager checks.
- Bots remain disabled placeholders until their trigger, condition, side effect, retry behavior, and audit requirements are verified from the export.

## Security and migration boundaries

- All mirror routes require a valid staff session.
- Manager-only operations are checked on the server.
- The web mirror writes to D1. It does not write back to AppSheet unless a later synchronization phase is explicitly designed and tested.
- Existing snapshot rows remain available while modules are replaced incrementally.
