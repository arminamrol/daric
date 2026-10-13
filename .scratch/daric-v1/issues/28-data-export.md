# 28: Data export

**What to build:** An Owner or Admin exports all Workspace data as JSON or CSV.

**Blocked by:** 23, 21

**Status:** done

- [x] Export of every domain entity, amounts as strings
- [x] CSV per entity zipped; JSON single file
- [x] Export is audited
- [x] HTTP test verifies completeness against the seed
- [x] Available on every Plan, including Free and after expiry

## Comments

Notes for later tickets:

- API: `GET /v1/workspaces/:wsId/export?format=json|csv` (JSON by default), Admin and above; Members and Viewers get 403. Answers a download (`Content-Disposition: attachment; filename="daric-export-<today in the Workspace's timezone>.json|.zip"`). Audit: `workspace.export` with `{ format }` and the client's IP and user agent.
- Module `modules/export`: `export.service.ts` lists every Workspace table (`entities`) and reads each with every column (`getTableColumns`), filtered by `workspace_id` on top of RLS, in a stable order. **A new Workspace table must be added there** and to `keyOf` in `export.http.test.ts`, whose completeness test fails for an entity the seed leaves empty or the export misses. `files.ts` turns the rows into the files: bigints (Amounts) as strings, times as ISO strings, `numeric` rates as stored.
- JSON: `{ format: 'daric-export', version: 1, exportedAt, workspace, members, accounts, valuations, exchangeRates, netWorthSnapshots, categories, labels, transactions, transactionLabels, recurringRules, recurringOccurrences, budgets, plannedItems, projectionSettings }`, each entity an array of rows keyed by the Drizzle column names (camelCase). Deleted Transactions are included with `deletedAt`, so confirmed occurrences and Label links never point at a missing row. Snapshot `breakdown` stays an object.
- CSV: a zip (fflate) of `<entity>.csv` with the same names, plus `workspace.csv`. UTF-8 with a BOM, CRLF, RFC 4180 quoting; null is an empty cell; objects (snapshot breakdown, workspace settings) as JSON text; an empty entity is a header row only. Text starting like a spreadsheet formula (`= + - @`, tab, CR) gets a leading `'`, except plain numbers (`-500` stays), so names and notes cannot run in Excel.
- Left out: audit logs (other Members' IPs and user agents) and identity tables (Members appear by `userId` and Role, no email; `daric_app` cannot read `users`). Ticket 40.1's Invitations and Consents need adding once they exist.
- No Plan check: there is no billing yet (40). ADR-0008 says data is never held back for non-payment, so ticket 40/43 must not gate this route.
- Built in memory; fine for a personal Workspace, would want streaming for very large Business ones.
- Web: Settings shows "خروجی داده‌ها" to Owners and Admins with CSV and JSON buttons (`settings/ExportData.tsx`), via `api.exportWorkspace(workspaceId, format)` → `{ blob, fileName }`.
- `seedDemo(db, { today, email })` takes an optional email so a test can seed its own demo Workspace without racing `demo.http.test.ts`.
- Open points from review: each entity is a separate SELECT in the request's READ COMMITTED transaction, so a write landing mid-export can make the files slightly inconsistent with each other. CSV can't tell null from an empty string. The formula guard makes CSV text differ from the JSON for text starting with `= + - @`. `exportFiles` in core maps a format to its extension and content type.
