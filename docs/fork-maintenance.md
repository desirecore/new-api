# Fork Maintenance

This document defines how this fork imports urgent external PRs while keeping a clean path back to official upstream.

## Branch Roles

- `main`: upstream mirror. Sync official upstream only.
- `deploy/main`: production deployment branch. It may contain temporary patches that are not yet upstream.
- `vendor/pr-<number>`: raw imported external PR branch. Do not add local edits here.
- `compat/pr-<number>`: local compatibility layer for a specific imported PR.
- `hotfix/<topic>`: urgent local fix unrelated to a specific external PR.

If a different deployment branch name is used, update `docs/patches.md` in the affected patch entries.

## Release Baseline and Verification

Production candidates MUST start from an explicitly selected official release tag. `main` is for upstream tracking and development, not the release baseline. An RC tag is still a prerelease; record upstream release warnings and do not infer production readiness from the existence of a tag.

1. Resolve and record the official tag and its peeled commit SHA. Create a new candidate branch from that commit.
2. Import only necessary fork patches and publishing configuration. Inspect patch ancestry before merging: a compatibility branch based on newer `main` can import unrelated upstream commits. Rebase the patch onto the selected baseline in a separate branch or cherry-pick its scoped commits, preserving provenance in `docs/patches.md`.
3. Inspect both the commit history and tree diff against the official tag. Every additional commit and changed file must be accounted for.
4. Name the fork version after that actual baseline. Record the fork commit SHA, patch list, image digest, and exact checks performed. Never reuse or move a published version tag.
5. Rehearse using an isolated copy of the currently deployed database, with separate cache and controlled outbound access. Verify migration and a second startup, data preservation, real client protocols and model mappings, video task creation/polling, and pre-consume/settlement/refund. Apply the database verification matrix from `AGENTS.md` when required.
6. Verify rollback on the rehearsal environment. Do not promise that replacing the image alone restores an older version; database and configuration compatibility must be demonstrated. Restoring a backup after new writes can lose data and requires a reconciliation plan.
7. Report build, publication, test deployment, acceptance, and production deployment as separate states. Only claim checks actually performed, distinguishing operator-reported results from agent-run verification. Promote the tested digest where possible; a rebuilt image requires verification again.

Release selection, provenance checks, and accurate handoff are the agent's responsibility.

### Incident: 2026-09 Release Baseline

`v1.0.0-rc.30-desirecore.2` was built from official `main` after rc.30, rather than from the rc.30 tag. The name obscured unreleased upstream changes, including reasoning suffix parsing that interpreted the real model ID `qwen3.8-max` as a reasoning alias. Claude Messages requests with `max_tokens: 64` then failed the manual-thinking budget check. Image build/publication was also described as deployment rehearsal without full database and client verification.

Keep the existing tag immutable for traceability. Future releases must follow the steps above. Do not treat successful CI as evidence that migration, client compatibility, billing, or rollback has been validated.

## One-Time Remote Setup

Configure the official repository as `upstream` in local clones that need to sync official changes:

```bash
git remote add upstream https://github.com/QuantumNous/new-api.git
git fetch upstream
```

Do not commit local git remote configuration; it lives in `.git/config`.

## Sync Official Upstream

Keep `main` clean and fast-forwardable when possible:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
```

If fast-forward is not possible, stop and inspect why `main` diverged before resolving.

## Import an Existing Upstream PR

When a PR already exists against official upstream:

```bash
git fetch upstream pull/<number>/head:vendor/pr-<number>
git push origin vendor/pr-<number>
```

Open a PR inside this fork from `vendor/pr-<number>` into `deploy/main`.

## Import a Contributor Fork Branch

When the source is another fork and branch:

```bash
git remote add contributor-<name> <contributor-repo-url>
git fetch contributor-<name>
git switch -c vendor/pr-<number> main
git merge --no-ff contributor-<name>/<branch>
git push origin vendor/pr-<number>
```

Use a stable branch name under `vendor/` even if the external branch name is temporary.

## Merge Temporary Patches for Deployment

Before merging into a deployment branch:

- Add or update the patch entry in `docs/patches.md`.
- Confirm whether the patch changes database schema, persisted config, billing/quota behavior, logs, channel config, model mapping, or API response format.
- Confirm rollback behavior with existing data.
- Run the relevant backend/frontend checks for the affected area.

Merge with provenance preserved:

```bash
git switch deploy/main
git merge --no-ff vendor/pr-<number>
```

If local fixes are needed, put them on a separate branch such as `compat/pr-<number>` and merge that branch after the vendor branch.

## Data Compatibility Rules

Temporary patches must keep a viable path back to official upstream.

- Prefer additive migrations: new tables, new nullable columns, new indexes, and new settings keys.
- Avoid column/table drops, renames, type changes, enum meaning changes, and irreversible data rewrites.
- If two implementations may store different data shapes, support reading both shapes before writing only the new one.
- Use dual writes when a rollback or official replacement needs old and new data to coexist.
- Keep feature toggles or config gates for behavior that may need emergency disablement.
- Never assume the official replacement PR will use the same schema or setting keys.

## Switching Back to Official Behavior

When upstream merges an equivalent feature:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch deploy/main
# Prepare the deployment candidate from the selected official release tag
# using the Release Baseline and Verification procedure above.
```

Then compare the local deployment delta:

```bash
git log --cherry --oneline main...deploy/main
git diff main...deploy/main
```

Do not merge moving `main` into a release candidate. Create the candidate from the selected official release tag and import only the local patches that still matter. Preserve existing shared deployment history and published tags; do not rewrite them as part of routine release preparation.

After validation:

- Remove or revert temporary local deltas that upstream now covers.
- Keep harmless historical database columns unless a separate, tested cleanup migration is required.
- Mark the patch as `Superseded` or `Removed` in `docs/patches.md`.
- Record the official PR or commit that replaced it.

## Patch Review Checklist

Use this checklist before merging a temporary external PR:

- Source PR/repository and exact commit range are recorded.
- Imported code is isolated from local compatibility changes.
- Database changes are additive or have an explicit compatibility plan.
- Billing/quota changes preserve non-negative, bounded charges.
- API behavior changes are documented for callers.
- Rollback plan works without dropping production data.
- Official replacement path is identified when known.
- Tests or manual verification are recorded in the PR.
