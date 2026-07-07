# Temporary Patch Register

This file tracks patches deployed in this fork before they are accepted upstream. Keep historical entries; do not delete them after removal. Mark their status instead.

## Status Values

- `Proposed`: recorded before merge, not deployed yet.
- `Deployed`: merged into a deployment branch.
- `Superseded`: official upstream now provides the intended behavior.
- `Removed`: the temporary patch has been reverted or replaced.

## Active Patches

| Patch | Status | Source | Imported Branch | Deployment Branch | Data Impact | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| PR 4810 - Ali wan2.7 and HappyHorse video support | `Deployed` | https://github.com/QuantumNous/new-api/pull/4810 | `vendor/pr-4810` | `deploy/main` | No database migration; relay/API and billing ratio changes only | Revert the vendor merge on `deploy/main`; no data cleanup expected |

## Patch Entries

### PR 4810 - Ali wan2.7 and HappyHorse video support

- Status: `Deployed`
- Source PR/repository: https://github.com/QuantumNous/new-api/pull/4810
- Source commit range: `05ea01dc6622cf36814377f57f99fc07c0f6c841`, `5cac039e583588fc46233c41c64fcf5024a80861`, `bcf4b0f8697c9f80727f9f4696335a360fb8c157`
- Imported branch: `vendor/pr-4810`
- Local compatibility branch: none
- Deployment branch: `deploy/main`
- Date imported: `2026-07-07`
- Date deployed: `2026-07-07`
- Owner: desirecore

#### Purpose

Deploy support for Ali `wan2.7-*` and `happyhorse-1.0-*` video generation models before the upstream PR is merged. The patch also makes Ali usage duration parsing tolerant of floating-point seconds, preventing completed video tasks from getting stuck when upstream returns values such as `20.02`.

#### Upstream Alternatives

- Official upstream PR: https://github.com/QuantumNous/new-api/pull/4810
- If upstream merges a different Ali video implementation, compare model names, request payload shape, task result parsing, and price ratio handling before replacing this patch.

#### Data Compatibility

- Database schema changes: none.
- Persisted settings/config changes: none.
- Log or audit data changes: none expected beyond normal relay/task logs.
- API request/response format changes: adds Ali task relay support for new model names and media field mapping for `image_url`, `video_url`, and `audio_url` form fields on new-format Ali video models.
- Billing/quota/accounting impact: adds price ratio handling for `wan2.7-*` and `happyhorse-1.0-*` Ali video models. The usage duration parsing fix is for upstream response compatibility and is not expected to change settlement because current task result parsing does not bill from those usage fields.
- Backward/forward compatibility plan: no destructive storage changes. Existing Ali model behavior remains in the same adaptor; rollback should only remove relay support for the new models and the tolerant usage parser.

#### Verification

- Inspected changed files and diff against `main`.
- Pending after merge: run targeted Go tests or a full Docker build if deployment timing allows.

#### Rollback Plan

Revert the PR 4810 vendor merge commit from `deploy/main`, then push the branch and rebuild the deployment image. No database cleanup is expected because the patch does not add migrations or persisted schema changes.

#### Official Replacement Plan

When upstream merges PR 4810 or an alternative implementation, sync upstream, compare `main...deploy/main`, and remove only the remaining local delta after verifying Ali video task creation, polling, status conversion, URL persistence, and quota settlement.

#### History

- `2026-07-07`: Imported PR 4810 into `vendor/pr-4810` and prepared it for `deploy/main`.

## Patch Entry Template

Copy this section for each temporary external PR.

### PR <number or name> - <short title>

- Status: `Proposed`
- Source PR/repository:
- Source commit range:
- Imported branch: `vendor/pr-<number>`
- Local compatibility branch:
- Deployment branch: `deploy/main`
- Date imported:
- Date deployed:
- Owner:

#### Purpose

Describe the production need and why this patch is being deployed before upstream accepts an official solution.

#### Upstream Alternatives

List related official or external PRs that may replace this patch later.

#### Data Compatibility

- Database schema changes:
- Persisted settings/config changes:
- Log or audit data changes:
- API request/response format changes:
- Billing/quota/accounting impact:
- Backward/forward compatibility plan:

#### Verification

List tests, build commands, manual checks, and environments used.

#### Rollback Plan

Describe how to disable, revert, or replace the patch without losing production data.

#### Official Replacement Plan

Describe how to compare this patch with the official upstream version and what data migration or cleanup may be needed.

#### History

- `YYYY-MM-DD`: Created entry.
