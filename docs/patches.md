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
| PR 4810 - Ali wan2.7 and HappyHorse video support | `Deployed` | https://github.com/QuantumNous/new-api/pull/4810 | `vendor/pr-4810` + `compat/pr-4810` | `deploy/main` | No patch-specific migration; task-plugin usage and billing configuration change | Revert the compatibility merge to restore the official Alibaba plugin; no data cleanup expected |

## Patch Entries

### PR 4810 - Ali wan2.7 and HappyHorse video support

- Status: `Deployed`
- Source PR/repository: https://github.com/QuantumNous/new-api/pull/4810
- Source commit range: `05ea01dc6622cf36814377f57f99fc07c0f6c841`, `5cac039e583588fc46233c41c64fcf5024a80861`, `bcf4b0f8697c9f80727f9f4696335a360fb8c157`; plugin compatibility commits `f6520a996998386f4853626cdcac872f87bd3c3d` through `7d7cf46e71f925c8a3c1a6d0ac2134436736e31d`
- Imported branch: `vendor/pr-4810`
- Local compatibility branch: `compat/pr-4810`
- Deployment branch: `deploy/main`
- Date imported: `2026-07-07`
- Date deployed: `2026-07-07`
- Owner: desirecore

#### Purpose

Deploy support for Ali `wan2.7-*` and `happyhorse-1.0-*` video generation models before the upstream PR is merged. The patch also makes Ali usage duration parsing tolerant of floating-point seconds, preventing completed video tasks from getting stuck when upstream returns values such as `20.02`.

#### Upstream Alternatives

- Official upstream PR: https://github.com/QuantumNous/new-api/pull/4810
- Official task-plugin migration: commit `eb48396d` / PR 7076, which replaces built-in Go task adaptors and partially covers `wan2.7-t2v` and `wan2.7-i2v`.
- If upstream merges PR 4810 or another Alibaba plugin update, compare model names, request payload shape, usage facts, and billing configuration before replacing this patch.

#### Data Compatibility

- Database schema changes: none.
- Persisted settings/config changes: Alibaba factory plugin version changes from `1.0.1` to `1.0.2`. Deployments upgraded across the official task-plugin migration must configure task billing expressions/prices for every enabled video model.
- Log or audit data changes: none expected beyond normal relay/task logs.
- API request/response format changes: adds Alibaba plugin support for `wan2.7-r2v`, `wan2.7-videoedit`, and `happyhorse-1.0-*`, including `image_url`, `video_url`, and `audio_url` media mapping for JSON and multipart requests.
- Billing/quota/accounting impact: the plugin reports bounded `seconds` and `resolution` usage facts for host-owned pricing and retains legacy resolution ratio output for the added models. Completion usage accepts decimal durations such as `20.02`.
- Backward/forward compatibility plan: no destructive patch-specific storage changes. Historical platform `17` tasks continue to resolve to the Alibaba plugin, and old upstream task IDs remain readable. The new official baseline adds its own task-plugin table and billing snapshots; rolling back the compatibility patch does not remove those records.

#### Verification

- Inspected changed files and diff against `main`.
- `go test ./relay/channel/task/ali` passed after the initial deployment merge.
- `go test ./relay/channel/task/ali` passed again after upgrading the deployment baseline to official `v1.0.0-rc.21`.
- `go test ./plugins ./pkg/jsplugin ./relay/channel/task/jsplugin ./relay` passed for the plugin compatibility implementation on the post-`v1.0.0-rc.30` official baseline.

#### Rollback Plan

Revert the `compat/pr-4810` merge from `deploy/main` to restore the official Alibaba factory plugin, then rebuild the deployment image. Existing task and plugin records can remain; no database cleanup is expected. This removes the extra models and their media mappings, so disable traffic to those models before rollback.

#### Official Replacement Plan

When upstream merges PR 4810 or an equivalent Alibaba plugin implementation, compare `plugins/tasks/alibaba/plugin.js` and its usage schema against `compat/pr-4810`. Remove only the remaining local delta after verifying task creation, JSON/multipart media conversion, polling of historical platform `17` tasks, artifact delivery, pre-consume, and final settlement.

#### History

- `2026-07-07`: Imported PR 4810 into `vendor/pr-4810` and prepared it for `deploy/main`.
- `2026-07-20`: Verified the patch remains deploy-only and retained it while upgrading the deployment baseline to official `v1.0.0-rc.21`.
- `2026-09-03`: Replaced the obsolete Go adaptor delta with `compat/pr-4810`, based on the official sandboxed task-plugin architecture after `v1.0.0-rc.30`.

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
