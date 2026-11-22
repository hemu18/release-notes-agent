# Release Notes Agent

After every production release, this agent reads the release's Jira tickets, writes the **general release note** and a **separate note for each customer with custom work**, certifies every note against fixed guardrails, and saves them as **Confluence pages** for the Product team to review. Customer Success gets a hand-off of the accounts the release could hurt, and why.

> Release notes tell you what shipped. This also tells you which customers it affects, and keeps one customer's work out of another customer's note.

Built in a four-hour speedrun at The Product Folks UnConference, 22 Nov 2026.

**Live demo:** https://claude.ai/artifact/Q99F5KScs9a2HNWaw75Egc. Visitors can explore the flow with sample tickets and run the Evals tab. A full live run (Jira, AI writer and evaluator, Confluence) needs a signed-in claude.ai account with Atlassian connected.

## What it does

1. **Tickets** – reads the release's tickets live from Jira (or a sample spreadsheet). Product selects them, enters the release number and clicks **Merge**.
2. **Prepare** – Product signs in, answers "Prepare training material?", and sees the rules locked on. Extra instructions can tighten the rules, never loosen them.
3. **Access check** – before reading any content: scoped to the merged tickets (a test read of an unselected ticket must be refused), read-only, linked documents from approved sources only, writes only in the Release Notes space.
4. **Confirm** – every ticket is classified as general, customer-specific, internal, or needs a decision (for example, an unknown customer named). Injected instructions and out-of-date documents are flagged. Affected accounts are ranked by risk. **Yes** stays disabled until every exception is resolved.
5. **Write and certify** – a writer agent drafts each note as structured JSON, with a source ticket per item. Code checks run, then a **separate evaluator agent** certifies it. Any hard-rule failure triggers a rewrite with the failure as feedback (up to 2 times), and then the note is blocked.
6. **Review in Confluence** – certified notes become Confluence pages. Customer and internal pages are private until shared. Also produced: a CS hand-off by CSM, a checked support FAQ and an action tracker.
7. **Review complete** – reads the edited pages back, re-runs the content checks, records the edit rate, and saves approved notes as style examples for the next release.
8. **Releases** – an audit trail of every run: who ran it, reviewed it and published it, with certificates, prompt version and settings. Also: mark published, retract (nothing is deleted), and an action tracker for deadlines.

## Guardrails

Hard rules block a note; quality rules are scored.

| | Rule |
| --- | --- |
| H1–H2 | Read-only; only the tickets in this release and the documents linked to them |
| H3–H4 | New pages only under this release's page; reruns create page versions; never delete, never publish (people publish) |
| H5–H6 | Run-scoped access; approved document sources only |
| **H7** | **The general note names no customer** (full names and short names) |
| **H8** | **A customer note names only its own customer** |
| H9–H10 | No personal data; no internal or commercial data (ARR, renewals, CSM names, ticket IDs) |
| H11–H12 | Third parties only where the feature connects to them; no technical internals |
| H13 | Internal and undecided tickets never go out |
| H14 | Nothing invented: every statement traces to a ticket or linked document |
| H15 | Instructions found inside tickets are ignored and logged (prompt injection) |
| H16–H17 | Training material uses demo accounts only; no roadmap promises |
| Q1–Q8 | Plain language, specific, action items first with dates, complete, tailored, ticket beats an out-of-date doc, no hype, template |

Design principle: **judgement that must be exact runs in code; the AI only writes and reviews words.** Classification, account risk, scope and most content checks are deterministic. The writer never receives commercial data, so it can't leak it.

## Evals

- **Answer key** (`demo-data/expected/`): 19 ticket-handling cases, 12 account-impact cases and 11 seeded violations. 42 of 42 pass; see the app's Evals tab, or run `node tests/core.test.js`.
- **Planted tests** in the demo data: out-of-scope ticket, missing ticket, unknown customer, internal ticket naming a customer, prompt injection, out-of-date document, cross-customer leak, support-window edges, setting-level precision.
- **Evaluator calibration**: six labelled notes (two correct, four with an invented date, number, feature or customer claim) measure the evaluator's misses and false blocks. This was added after the first live run, where the evaluator wrongly blocked two correct customer notes.

## Documents

- [Product doc](docs/product.md): problem, flow, design, requirements R1 to R18, demo walkthrough
- [Guardrails and evals spec](docs/guardrails-and-evals.md): hard rules H1 to H17, quality rules Q1 to Q8, checks and pass bar

## Repository

```
app/release-notes-agent.html   the built, single-file app
app/src/app.src.html           UI and orchestration (Jira, Confluence, writer, evaluator, audit trail)
app/src/core.js                deterministic rules: scoped reader, classifier, risk rules, note planner, code checks
app/src/data.json              demo accounts, support history, linked docs, answer key
app/build.py                   inlines data and core into the page
tests/core.test.js             answer-key and seeded-violation tests (Node, no dependencies)
demo-data/                     CSVs, help docs, answer key, Jira import file
docs/                          product doc and guardrails spec
```

## Run it

- **Tests:** `node tests/core.test.js`
- **Build:** `python3 app/build.py`
- **App:** the page runs as a Claude artifact on claude.ai. Its runtime capabilities are Claude (writer and evaluator), the Atlassian connector (Jira read; Confluence pages), and saved state (audit trail, settings, calibration). To point it at your own site, change `ATL_CLOUD`, `ATL_JQL` and `CONF` in `app/src/app.src.html`, then rebuild.
- **Jira demo data:** import `demo-data/release_notes_demo_jira_import.csv` into a Jira project. The labels carry type, area, setting, customer and the original IDs.

## Demo versus production

| Area | Demo | Production |
| --- | --- | --- |
| Tickets | Live from Jira through the viewer's Atlassian connection | Same queries, under a read-only service account, triggered by "version released" |
| Notes | Confluence pages through the viewer's connection | Service account limited to the Release Notes space |
| Accounts and support history | Demo CSVs | CRM and support tool through MCP or APIs |
| Run | In the browser; resumable after a reload | Server-side job queue |
| Publishing | Recorded (channel, date, who) | Sent to changelog, email or help centre |
