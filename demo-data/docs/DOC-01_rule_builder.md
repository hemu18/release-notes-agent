# Building campaign triggers with the rule builder

Doc ID: DOC-01 · Source: Confluence · Last updated: 2026-11-18 · Audience: all customers

## What changed in 4.12
Campaign trigger rules now live in the rule builder (Campaigns > Triggers > Rule builder). Existing rules were migrated automatically. Nothing needs to be rebuilt.

The trigger "On survey complete" is now called **"Response received"**. It behaves exactly as before. Saved filters and reports that used the old name keep working.

## Checking your migrated rules
1. Open Campaigns > Triggers > Rule builder.
2. Each migrated rule shows a "Migrated" badge for 30 days.
3. Open the rule and confirm the conditions match what you expect.

## Building a new rule
1. Click **New rule** and pick a trigger event, for example "Response received".
2. Add conditions such as score range, location or agent.
3. Choose the campaign to start and save.

## Tips for admins
- Rules with more than five conditions run slightly slower. Split them into two rules if you can.
- Teams that train new agents on triggers should update their training material to use the new name.
