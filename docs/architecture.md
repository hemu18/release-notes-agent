# Release Notes Agent – Architecture (HLD and LLD)

This document covers the demo as built (22 Nov 2026) and the production design it points to. Rule IDs (H1–H17, Q1–Q8) are defined in [guardrails-and-evals.md](guardrails-and-evals.md); requirement IDs (R1–R18) in [product.md](product.md).

## 1. High-level design

### Design principle
**Judgement that must be exact runs in code; the AI only writes and reviews words.** Scope, classification, account risk, note planning and most content checks are deterministic and unit-tested. Two separate AI calls do what code can't: a writer drafts the notes, and an evaluator, which never sees the writer's prompt, certifies them.

### Components

```
              ┌────────────────────────── Browser page (claude.ai artifact) ───────────────────────────┐
 Jira (RN) ──►│ Scoped reader ─► Classifier ─► Impact rules ─► Note planner ─► Writer agent ─► Code checks│
 read-only    │      (H1,H2)       (core.js)     (core.js)       (core.js)     (Claude)        (core.js)  │
              │                                                                    │                 │
 Linked docs ►│                                                                    ▼                 │
 Accounts,    │                                                       Evaluator agent (Claude, separate)
 support ────►│                                                       pass ─► certificate   fail ─► rewrite ×2 ─► block
 (demo CSVs)  │                                                                    │                 │
              │  Saved state (db): runs, certificates, actions, examples, settings, page map          │
              └───────────────────────────────────────────────────────────────────┼─────────────────┘
                                                                                  ▼
                                                   Confluence space RELNOTES (H3 guard): release page ─► notes (customer pages private), internal page
```

| Component | Responsibility | Demo implementation | Production |
| --- | --- | --- | --- |
| Trigger and ticket source | Tickets in the release | Product selects Done tickets from Jira project RN (live) or the sample spreadsheet, clicks Merge | "Version released" webhook; JQL on fix version under a read-only service account |
| Scoped reader | Read only merged tickets and their linked docs; refuse anything else (H1, H2, H6) | `makeReader()` in core.js; access check does a test read of an unselected ticket, which must be refused | Same, enforced by the service account's Jira and Confluence permissions |
| Classifier | General / Customer-specific / Internal / Needs decision; flags injections and out-of-date docs | `classify()` | Same code, server-side |
| Impact rules | Affected accounts and risk level from features, settings, 90-day support history and renewal window | `impact()`, `actionItems()` | Live CRM and support-tool data through MCP or APIs |
| Note planner | General note plus one note per customer with specific tickets, each tailored with the general changes that touch that customer | `planNotes()`, `batches()` | Same |
| Writer agent | Drafts each note as structured JSON, one source ticket per item; never receives ARR, renewals, contacts or CSMs | `sample()` call from the page; prompt version stamped on every certificate | Claude API from a job worker |
| Code checks | H7–H13, H15, H17, Q4, Q8 | `codeChecks()` | Same |
| Evaluator agent | H7–H9, H11, H12, H14, H15, H17, Q1–Q7, with quoted evidence; gets the customer profile for customer notes | Separate `sample()` call; two rewrites, then block | Claude API, separate call |
| Confluence writer | Release page, note pages, internal page; reruns update pages so Confluence keeps versions (H3) | Atlassian connector via the viewer's account; `allowedParents` guard | Service account limited to the Release Notes space |
| Review loop | Reads edited pages back, re-runs content checks, records edit rate, saves approved notes as style examples | `runReview()`, `editRate()`, `anonymise()` | Same, plus channel publishing |
| Audit trail | Who ran, reviewed and published; certificates, model, latency, prompt version, settings | Artifact database | Application database |

### End-to-end flow
1. **Tickets → Merge.** Product selects tickets and a release number.
2. **Product login → Prepare.** Training-material question; locked rules; optional extra instructions that can only tighten.
3. **Access check.** Scope, read-only, document sources, Confluence write scope, AI available, audit trail on. Any failure stops the run.
4. **Confirm.** Classification counts, exceptions to resolve, flags, affected accounts. "Yes" is disabled until every exception is decided.
5. **Write and certify.** Notes written in parallel; code checks, then evaluator; rewrites with the failure as feedback; block after two.
6. **Save.** Certified notes and the internal page go to Confluence; blocked notes are never saved.
7. **Review in Confluence → Review complete.** Re-check, edit rate, close.
8. **Releases tab.** Publish state, retraction, action tracker.

### Trust boundaries
- Ticket and document text is **data, never instructions** (H15). Injection patterns are flagged by code and the evaluator is told to ignore embedded instructions.
- The writer is given only what a customer may see; commercial data stays in code and goes only to the private CS hand-off.
- Nothing is published by the agent (H4). Publishing is recorded as a person's action.

## 2. Low-level design

### Rules engine (`app/src/core.js`)
Pure functions, no I/O, run identically in the page and in Node tests.

| Function | Input → output |
| --- | --- |
| `makeReader(manifestIds, cfg)` | Scoped reader: `ticket(id)` and `doc(id)` throw for anything outside the release (H2) or from an unapproved source (H6) |
| `classify(ids, reader, releaseDate, cfg)` | Rows `{id, cls, customer, reason, flags[]}`. Customer detection order: Jira Customer field → full account name → short name (alias, flagged for confirmation). Unknown customer named → Needs decision |
| `impact(ids, releaseDate, specificIds, cfg)` | Per account: `level` (High / Medium / Low / Not affected), `riskTickets`, `evidence` (support tickets in window), `good` (complaints fixed in this release), `days` to renewal |
| `actionItems(impact)` | Account × Action-required ticket pairs for the tracker |
| `planNotes(classRows, decisions)` | Note list: general note tickets, and per customer its specific tickets plus general tickets matching its features and settings |
| `batches(ids, size)` | Splits large releases by feature area (R16) |
| `render(note, draft, release, date, mode)` | Template: header, greeting (customer notes), Summary, Action required, New features, Changes, Fixes, Need help, footer |
| `codeChecks(note, text, sources, cfg, mode)` | Rule results `{id, pass, evidence}` for H7–H13, H15, H17, Q4, Q8 |
| `reviewChecks(...)` | Content checks re-run on Product-edited pages |
| `editRate(a, b)` | Word-level LCS change ratio |
| `anonymise(text)` | Strips names before saving approved notes as style examples |
| `mergeDrafts(parts)` | Joins batched drafts |

**Risk rules (exact):** support window 90 days; renewal soon ≤ 60 days. Risk tickets are customer-visible Change or Action-required tickets that are not customer-specific. An account is affected if it uses the ticket's feature area and, when the ticket names a setting, has that setting. **High** = affected and (negative support ticket in an affected area, or renewal soon). **Medium** = affected and (neutral ticket, or an Action-required ticket). **Low** = affected only. A negative ticket fixed by this release counts as neutral.

**Configuration (`DEFAULT_CFG`, editable in Settings with a change log, R15):** `supportWindowDays 90`, `renewalDays 60`, `staleDocDays 60`, `batchSize 25`, vendor allow and deny lists, approved document sources.

### Agents
- **Writer prompt** includes: rules, the note's tickets and linked documents, release mode, approved style examples, tailoring limits for customer notes. Output JSON: `{summary, action_required[{title, text, by_when, source}], new_features[], changes[], fixes[]}`, each item with a `source` ticket.
- **Evaluator prompt** includes: rules, the rendered note, the source tickets and documents, and the customer profile for a customer note. It never sees the writer prompt. Output: per-rule pass or fail with quoted evidence, and Q1–Q7 scores (1–5).
- **Certificate**, stored per note: status (Certified / Certified with flags / Blocked), attempt number, rule results, scores, model tier applied, latency, prompt version.

### Integrations
| System | Calls | Notes |
| --- | --- | --- |
| Jira | `searchJiraIssuesUsingJql` with `project = RN` | Read-only. Labels carry type, area, setting, customer, support links and the original ID. Statuses Done and Released to Prod are selectable |
| Confluence | `searchConfluence`, `getConfluenceContent`, `createConfluenceContent`, `updateConfluenceContent` | Space RELNOTES. Titles carry the release because titles are unique per space. Lookup by exact title before creating (Confluence may add " (2)" instead of refusing a duplicate). Customer and internal pages are created private. HTML is converted to Confluence storage-safe tags (`<strong>`, `<em>`, no inline styles) |

### Stored data (artifact database)
| Path | Holds |
| --- | --- |
| `runs/{runId}` | Run state for resume (R13): tickets, decisions, notes, certificates, step log, who ran, reviewed and published, status (generating → saving → in_review → closed / published / superseded / retracted) |
| `actions/{id}` | Action tracker items with deadlines, ticked off by CS (R9) |
| `examples/*` | Anonymised approved notes used as style examples (R2) |
| `settings/config` | Admin settings and change log (R15) |
| `calibration/latest` | Last evaluator calibration result (R12) |
| `confluence/{release}_{mode}` | Page-ID map, so reruns update pages instead of creating new ones |

### Failure handling
| Failure | Behaviour |
| --- | --- |
| Access check fails | Run stops; the failing checks are listed with a Check again button |
| Hard-rule failure | Rewrite with the failure as feedback, up to 2 times; then Blocked and never saved |
| Evaluator reply unreadable | Treated as a failed attempt |
| Confluence create fails or page was deleted | Look up by title, then update; otherwise show the error with Try saving again |
| Browser reload mid-run | Resumes from saved run state; already-saved pages are not duplicated |
| Rerun of a release | Only notes whose tickets changed are rewritten (or all, if Product ticks Rewrite all); earlier run marked superseded |

### Testing
- `tests/core.test.js` (Node, no dependencies): 19 ticket-handling cases, 12 account-impact cases and 11 rule checks against `demo-data/expected/`. All 42 pass.
- Full-flow smoke tests with fake Jira and Confluence connectors cover create, rerun (versions, no duplicates), fallback after a deleted page, the H3 guard and review.
- Evaluator calibration (Evals tab): six labelled notes; reports misses and false blocks.

## 3. Production path (pilot)
| Area | Change |
| --- | --- |
| Runtime | Server-side job worker (e.g. FastAPI) and a React front end; runs survive a closed browser |
| Identity | Read-only service account for Jira; Confluence service account limited to the Release Notes space |
| Data | Live CRM and support-tool data replace the demo CSVs |
| Trigger | Jira "version released" webhook instead of manual Merge |
| Publishing | Changelog, email and help-centre channels, still released by a person |
| Observability | Run metrics: time to notes, edit rate, blocks per rule, calibration trend |
