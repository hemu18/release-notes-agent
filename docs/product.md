# Release Notes Agent – Product Doc

Nov 22, 2026 · @Hemanth

After each production release, an agent writes the general release note and one note per customer with custom work, certifies them against fixed rules, and saves them as Confluence pages for Product to review.

## Problem and scope

Release communication is manual: after each production release someone works out what shipped, who it affects and what each customer needs to hear. Customer-specific work and indirect impact are the parts most often missed.

|  | v1 (this demo) |
| --- | --- |
| Owner | Product team; CS gets the notes offline |
| Trigger | A production release is merged with its ticket IDs |
| Inputs | Tickets, linked documents, accounts, support history (live Jira project; Excel stand-ins for CRM and the support tool) |
| Outputs | release note\_general, plus release note\_{customer} for each customer with customer-specific tickets, saved as Confluence pages under the release page (PDF export from Confluence) |
| Out of scope for v1 | Training material (the question is asked; generation comes later), publishing to customers (always a person's action) |

## Flow

Eight screens; a person decides at the confirmation and at review, and the agent does the rest.

1. **Tickets.** Select the Done tickets, enter the release number, click **Merge**.
2. **Product login.** Product signs in for this run.
3. **Prepare.** Training material Yes or No; the hard and quality rules shown locked on; optional extra instructions that can only tighten them.
4. **Access check.** Scope limited to the merged tickets (a test read of another ticket must be refused), linked documents reachable, writes limited to the release page in Confluence, AI agents available. Any failure stops the run.
5. **Confirm.** Counts by class, exceptions to resolve (an unknown customer such as Evergreen Homes), flags (an injected instruction, an out-of-date document), and affected accounts with risk levels for Product and CS. **Yes** stays disabled until exceptions are resolved.
6. **Write and certify.** Notes are written in parallel. Each passes code checks, then a separate evaluator agent; a hard-rule failure triggers a rewrite with the failure as feedback, up to twice, then the note is blocked.
7. **Review in Confluence.** Certified notes are saved as Confluence pages; a rerun updates the page, keeping its version history. Product reviews and edits in Confluence.
8. **Review complete.** The app reads the edited pages, re-runs the content checks, records the edit rate and closes the release.

## Design

Judgement that must be exact runs in code; the AI only writes and reviews the words.

| Component | What it does | Where it runs (demo) |
| --- | --- | --- |
| Scoped reader | Read-only access to the merged tickets and their linked documents; anything else is refused (H1, H2, H6) | Page code |
| Classifier | General, customer-specific (a known account named in subject or description), internal, or needs decision (an unknown customer named); flags injected instructions and documents older than the release | Page code |
| Impact rules | Affected accounts and risk from features, settings, 90 days of support history and renewal timing | Page code |
| Note planner | General note gets the general tickets; each customer note gets its specific tickets plus general tickets that touch its features and settings | Page code |
| Writer agent | Drafts each note as structured JSON with a source ticket per item; sees only that note's tickets and documents, never ARR, renewals, contacts or account managers | Claude, from the page |
| Code checks | H7 to H13, H15, Q4, Q8: customer names, personal data, internal data, vendors, technical detail, scope, coverage, template | Page code |
| Evaluator agent | H7 to H9, H11, H12, H14, H15 and Q1 to Q7, with quoted evidence; never sees the writer's prompt | Claude, separate call |
| Confluence writer | Creates or updates the release page, its note pages and Training Materials only under the Release Notes space home (H3 guard); customer and internal pages private | Atlassian connector |

The writer never receives commercial data, so it cannot leak it; the code checks are the backstop.

Rules and the pass bar: [Guardrails and Evals Spec](https://claude.ai/artifact/Ekw3WV9WKN98jGx8pSTCJg).

## Success measures

The deterministic suite in the app's Evals tab passes 42 of 42 cases on the v4.12.0 answer key: 19 ticket-handling cases, 12 account-impact cases and 11 rule checks (10 seeded violations and the document-source allowlist). Evaluator calibration is tracked separately.

| Measure | Target |
| --- | --- |
| Answer-key suite (Evals tab) | 42 of 42; evaluator calibration with zero misses and zero false blocks |
| Hard-rule failures reaching review | Zero; each one found becomes a new test case |
| Evaluator quality scores Q1 to Q7 | Average 4 or more, none below 3 |
| Edit rate at review | Under 20% after the first 5 releases |
| Time from Merge to notes in Confluence | Tracked per release; about 1 to 3 minutes in the demo |

## Requirements from the product, CS and engineering review

All eighteen requirements are in v1; fifteen are built in the demo, and three need the backend for their last step.

| ID | Requirement | From | Status |
| --- | --- | --- | --- |
| R1 | Saved audit trail: each run's tickets, decisions, certificates, model, prompt version and settings, and who ran, reviewed and published it | CPO | Built |
| R2 | Feedback loop: notes approved at review become anonymised style examples for the next release | CPO | Built |
| R3 | Release updates: a rerun rewrites only notes whose tickets changed, keeps the rest, saves new versions and marks the earlier run superseded | CPO | Built |
| R4 | Retraction with a reason; a notice is added to the release page and nothing is deleted | CPO | Built |
| R5 | Customer detection from the Jira Customer field, the full name, or a short name (flagged to confirm) | CPO | Built on demo data; live field needs Jira |
| R6 | Published state: channel, date and who | CPO | Recorded; sending to channels needs the backend |
| R7 | Pre-release mode: advance notice on planned tickets before they ship | CS | Built |
| R8 | CS hand-off document by CSM: affected accounts, risk, ARR, renewal, reasons, actions, links to customer notes | CS | Built |
| R9 | Action tracker: each account's required action and deadline, ticked off by CS | CS | Built |
| R10 | Good news: complaints fixed in the release, with the support tickets to close | CS | Listed; closing tickets needs the support-tool connector |
| R11 | Support FAQ from the general note, each answer checked against the content rules | CS | Built |
| R12 | Evaluator calibration: labelled good and bad notes, misses and false blocks, rerun after every prompt change | Engineering | Built |
| R13 | Resumable runs with no duplicate files after an interruption | Engineering | Built in the page; a server-side job runner needs the backend |
| R14 | Approved document sources (H6) and a check against roadmap promises (H17) | Engineering | Built |
| R15 | Admin settings for windows, vendors and sources, with a change log | Engineering | Built |
| R16 | Batching by feature area for large releases | Engineering | Built |
| R17 | Latency, model and prompt version on every certificate | Engineering | Built |
| R18 | Service-account Confluence access and live Jira, CRM and support data | Engineering | Needs the backend |

## Demo limits and phase 2

The demo runs entirely as one page inside claude.ai; phase 2 moves it to a service with its own scoped access.

| Area | Demo | Phase 2 |
| --- | --- | --- |
| Data sources | Live Jira project (RN); Excel and Markdown stand-ins for docs, CRM and support | Jira, Confluence, CRM and support tool through MCP or APIs |
| Confluence access | Runs with the viewer's Atlassian connection; the page's code restricts writes to the Release Notes space | A service account limited to that space, so Atlassian enforces the limit |
| Hosting | Published artifact; Claude calls use the viewer's account | FastAPI backend and React front end, as in Anaadya Studio |
| Login | Role switch | Real sign-in with run-scoped credentials (H5) |
| PDF on close | Exported from the reviewed Confluence page (Export → PDF) | Server-side export with the branded template |
| Training material | Question only | Video or audio, using generic demo accounts (H16) |
| Documents | This doc and the spec | Separate HLD and LLD, SOP, deployment guide, user manual |

## Demo walkthrough for stakeholders

Ten minutes, one release, and a person deciding at every point that matters.

| Screen | Show | Say |
| --- | --- | --- |
| Tickets | 17 Done tickets selected, release v4.12.0, Merge; point out the Pre-release mode | Notes start from what actually shipped, or from what is planned if customers need warning |
| Prepare | The locked rules and the training-material question | Product can tighten the rules for a release, never loosen them |
| Access check | The refused test read of REL-118 | The agent can only see this release |
| Confirm | 11 general, 2 customer-specific, 3 internal; the Evergreen Homes decision; the injected instruction and the out-of-date document flagged; affected accounts | The agent explains; a person decides |
| Write and certify | Live certificates, code checks plus a separate evaluator | Nothing reaches a reviewer without passing every hard rule |
| Review in Confluence | Three pages, plus the CS hand-off and support FAQ on the private internal page | Product reviews where they already work; CS gets who is affected and why |
| Review complete | Re-check, edit rate | Every human edit teaches the next release |
| Releases | Audit trail, published state, action tracker for the SAML and grid deadlines | Who approved what, and who still has to act before 15 January |
| Evals | 42 of 42 rule cases; evaluator calibration | We test the tester |

The ask: approval to move from this demo to a pilot with live Jira, Confluence and a service account (requirement R18), starting with one product line's next two releases.
