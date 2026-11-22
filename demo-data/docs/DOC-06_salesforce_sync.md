# Salesforce sync settings

Doc ID: DOC-06 · Source: Confluence · Last updated: 2026-11-16 · Audience: all customers

## What changed in 4.12
Salesforce sync now runs **every hour** instead of every 15 minutes. This keeps accounts within Salesforce API limits and reduces failed syncs.

## Who will notice
Teams that act on survey responses inside Salesforce will see new records up to an hour later than before.

## Urgent records
Admins can push records immediately with **Sync now** under Integrations > Salesforce. Sync now can be used up to 10 times a day.

## Checking sync health
Integrations > Salesforce > Sync log shows each run, the records sent and any errors.
