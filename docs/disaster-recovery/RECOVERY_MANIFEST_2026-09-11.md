# KalMargin — Disaster Recovery Manifest

Snapshot date: 2026-09-11
Repository: Vutovk31/KalMargin
Recovery branch: backup/dr-2026-09-11
Source: main at the moment the recovery branch was created.

## Recovery intent
Non-production recovery anchor only. Do not auto-merge.

## Reconciliation rule
Treat this branch as the remote committed baseline. Compare it with any local workspace, exported ChatGPT history and Drive material before assuming it is the latest state.

## Restore rule
Preserve the branch, fetch all refs, restore dependencies, run available verification, and only then resume development. Never store secret values in recovery artifacts.
