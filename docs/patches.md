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
| _None_ | - | - | - | - | - | - |

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
