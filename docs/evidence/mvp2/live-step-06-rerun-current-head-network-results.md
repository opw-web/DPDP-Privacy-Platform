# Step 6 current-head live rerun — network results (FAILED acceptance)

Run at 2026-09-02 22:12–22:21 IST against current head `69bc837`.

This is a browser-only acceptance attempt: an Acme Administrator logged in
through `/login`; every product mutation below was a physical/native browser
click on the visible **Sync now** control. No SQL, reset/reseed, API client
call, or product-code change was used. Network results were read in the
browser DevTools Network panel.

## Serial source runs

| Visible source | Source ID | UI POST result | Latest completed SyncJob | Read / failed / skipped | Created / linked / candidates |
| --- | --- | --- | --- | --- | --- |
| Marketing | `8a7521f2-8ba5-4710-ac0a-339c934afaae` | `202` `/api/data-sources/{id}/sync`; visible `Sync queued.` toast | `cc34a2fd-5038-4ac9-80f3-6c318448135b`, `SUCCESS`, 22:13 | 114 / 0 / 114 | 0 / 0 / 0 |
| Sales | `949ac37b-08c0-4dd2-9fa4-b10fb234f3f0` | `202` `/api/data-sources/{id}/sync`; visible `Sync queued.` toast | `5bc1408f-4e6f-4a43-8079-55e4abe95941`, `SUCCESS`, 22:15 | 137 / 0 / 137 | 0 / 0 / 0 |
| Support | `5db1ad69-5a6d-454f-9040-d3b1495d1332` | `202` `/api/data-sources/{id}/sync`; visible `Sync queued.` toast | `28c4c858-a924-475d-b113-f9da6e42e2a6`, `SUCCESS`, 22:16 | 133 / 0 / 133 | 0 / 0 / 0 |
| E-commerce | `4c9474b1-7f6d-4303-a905-005394fe23fa` | `202` `/api/data-sources/{id}/sync`; visible `Sync queued.` toast | `b47b00b3-85ec-4c70-b528-24a063d62280`, `SUCCESS`, 22:17 | 116 / 0 / 116 | 0 / 0 / 0 |

The final list visibly shows all four latest-sync timestamps and read counts:
114 + 137 + 133 + 116 = 500. The Sync Jobs responses are authenticated browser
requests to `GET /api/sync-jobs?dataSourceId={id}&limit=1`.

## Post-sync browser observations

`GET /api/inventory/summary`, shown on the visible dashboard, returned:

```json
{
  "sourceCount": 4,
  "rawRecordCount": 500,
  "uniquePrincipalCount": 323,
  "matchedPrincipalCount": 323,
  "pendingReviewCount": 4,
  "conflictCount": 150,
  "unknownAgeStatusCount": 211
}
```

The dashboard labels `conflictCount` as **“Principals with a source-conflicting
field”** and its evidence-gap card says **“150 data principal(s) have a field
flagged with a source conflict.”** Thus the observed 150 is the product's
principal-level conflict metric, not a raw count of conflicting field rows or
records; it does not substantiate the required 12.

Read-only proof screens:

- `GET /api/match-candidates?status=PENDING` visibly returned exactly four
  PENDING POSSIBLE cards: Vikram Nair, Priya Menon, Karan Malhotra and Divya
  Iyer. No candidate decision was clicked.
- `GET /api/principals?q=Rahul+Verma&page=1` returned two separate result IDs:
  `DP-000002` and `DP-000219`. The table renders the former as `Principal
  DP-000002` (no display name/source present) and the latter as Rahul Verma
  from Support. This proves two separate search results/references, but the
  first row's missing display/lineage means the UI does not present the strong
  two-named-Rahul proof requested by the preparation document.
- `GET /api/principals?ageStatus=CHILD&page=1` visibly returned exactly six
  CHILD rows: `DP-000288` through `DP-000293` (in the displayed ordering).

## Diagnosis and stop condition

All four UI-triggered jobs are successful but fully idempotent: each has
`recordsSkipped == recordsRead` and zero principals created/linked. The rerun
therefore did not execute a creation path that could backfill the four missing
principals; the dashboard remains 323, not the required 327. This establishes
the live stop condition without making an unsupported repair.

The current Data Sources UI exposes only **New data source** and one **Sync
now** control per existing row. It has no supported recompute/backfill/reset
control. Attempting the preparation document's source-detail URL rendered an
empty frontend page even though its browser network request to
`GET /api/data-sources/{id}` returned 200, so a visible Sync History/recompute
workflow was not available. No destructive reset, mapping edit, or candidate
decision was attempted.

## Screenshots

- `live-step-06-rerun-current-head-baseline-sources.png`
- `live-step-06-rerun-four-source-list-success.png`
- `live-step-06-rerun-current-head-dashboard-failed-500-323-4-150.png`
- `live-step-06-rerun-review-4-pending-current-head.png`
- `live-step-06-rerun-rahul-verma-two-distinct-current-head.png`
- `live-step-06-rerun-child-filter-current-head.png`

The screenshot named `live-step-06-rerun-dashboard-500-327-4-12.png` was
captured before the failure was known; despite its inaccurate filename it
contains the same visible 500 / 323 / 4 / 150 result. It is not cited as
acceptance evidence; the clearly named `*-failed-500-323-4-150.png` file is
the authoritative dashboard capture.
