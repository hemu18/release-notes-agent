# Release Notes Agent – Demo guide (one page)

**Live demo:** https://claude.ai/artifact/Q99F5KScs9a2HNWaw75Egc

## Two ways to see it

| | Visitor (anyone with the link) | Full run (owner) |
| --- | --- | --- |
| Who | Judges, reviewers, anyone signed out | A claude.ai user with Atlassian (Jira and Confluence) connected |
| Tickets | Sample spreadsheet (same 17 tickets as Jira) | Live from Jira project RN |
| What runs | Classification, risk ranking, Evals tab, read-only copy of the notes from the last live run | Everything: AI writer, evaluator certificates, Confluence pages, audit trail |
| Stops at | Access check (expected): choose **Continue as a visitor** | Nothing; runs to Closed |

## Visitor walkthrough (3 minutes)
1. Open the link. Read the **Visitor view** banner; click **See the notes from the last live run** to see the four Confluence pages (general note, two customer notes, internal CS hand-off and FAQ).
2. **Tickets:** keep the 17 Done tickets, release `v4.12.0`, click **Merge**.
3. **Product login → Prepare:** click **Log in as Product**, leave Training material at **No**, note the locked rules, click **Prepare release notes**.
4. **Access check:** the AI, Confluence and history checks fail for visitors. This is the guardrail refusing to start. Click **Continue as a visitor**.
5. **Confirm:** see 11 general, 2 customer-specific, 3 internal and 1 needs decision. Choose **Leave out** for the Evergreen Homes ticket. Open **How each ticket is handled** (the injected instruction and out-of-date document are flagged) and **Accounts affected** (risk by fixed rules). Click **Yes** to see the saved notes.
6. **Evals tab:** the 42 rule cases run on the spot; all pass. (Evaluator calibration needs a signed-in account.)

## Full run (owner, about 5 minutes)
**Before you start:** claude.ai signed in; Atlassian connector connected with access to site `hemu18.atlassian.net`; Jira project RN imported (`demo-data/release_notes_demo_jira_import.csv`); Confluence space **Release Notes** (key RELNOTES). For a clean demo, delete earlier `v4.12.0` pages in Confluence first.

1. **Tickets:** Jira · RN project → **Load from Jira**. 17 Done tickets are selected (RN-36 is In Progress and can't be). Release `v4.12.0` → **Merge**.
2. **Log in as Product → Prepare.** Training material **No** → **Prepare release notes**.
3. **Access check:** all green, including the refused test read of a ticket outside the release → **Continue**.
4. **Confirm:** decide the Evergreen Homes ticket. On a rerun, tick **Rewrite all notes anyway** if you want every note regenerated. Click **Yes**.
5. **Write and certify:** watch each note pass code checks and the evaluator. Open a **Certificate** to show per-rule evidence. A blocked note is never saved; that is a guardrail, not an error.
6. **Review in Confluence:** open the release page. Customer notes and the internal page (CS hand-off by CSM, support FAQ) are private. Edit a note if you like, then come back and click **Review complete**: the app re-checks the edits and records the edit rate.
7. **Releases tab:** audit trail, mark published, retract, action tracker for the SAML and grid deadlines.

## Points to make
- **Customer isolation:** the general note names no customer; each customer note names only its own customer (H7, H8), checked by code and a separate evaluator.
- **Exact things run in code:** scope, classification and risk are deterministic and tested (42 of 42); the AI only writes and reviews words.
- **Nothing ships unchecked:** two rewrites, then block. People publish; the agent never does.
- **CS gets the why:** affected accounts, ARR, renewal, the complaint it touches, the action and the good news, privately.

## Troubleshooting
| Symptom | Fix |
| --- | --- |
| "Load the tickets from Jira to begin" never loads | Check the Atlassian connector is connected in claude.ai and has access to the site |
| Button says "Yes, keep all 3 notes unchanged" | This release was run before and nothing changed. Tick **Rewrite all notes anyway** |
| A note is Blocked | Open its certificate to see the failing rule. Rerun with Rewrite all for a fresh attempt |
| Confluence error on save | Click **Try saving again**; the run resumes without duplicating pages |
| "Release v4.12.0 (2)" appears in Confluence | Left from an older version; delete it and its child pages, then rerun |
