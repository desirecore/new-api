# Fork Maintenance

This document defines how this fork imports urgent external PRs while keeping a clean path back to official upstream.

## Branch Roles

- `main`: upstream mirror. Sync official upstream only.
- `deploy/main`: production deployment branch. It may contain temporary patches that are not yet upstream.
- `vendor/pr-<number>`: raw imported external PR branch. Do not add local edits here.
- `compat/pr-<number>`: local compatibility layer for a specific imported PR.
- `hotfix/<topic>`: urgent local fix unrelated to a specific external PR.

If a different deployment branch name is used, update `docs/patches.md` in the affected patch entries.

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
git merge --no-ff main
```

Then compare the local deployment delta:

```bash
git log --cherry --oneline main...deploy/main
git diff main...deploy/main
```

For shared deployment branches, prefer merging `main` into `deploy/main` over rebasing to avoid rewriting history. For a cleaner cutover, create a new deployment branch from `main` and merge or cherry-pick only the local patches that still matter.

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
