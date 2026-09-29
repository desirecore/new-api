# rc.33 Fork Candidate

## Provenance

- Official baseline: `v1.0.0-rc.33` at `eb99ab1b40343c3317bb47981cccdbb2b159a5fa`, verified against the official GitHub tag reference.
- Candidate branch: `codex/release-rc33`.
- Intended fork version: `v1.0.0-rc.33-desirecore.1`.
- Production predecessor: `v1.0.0-rc.30-desirecore.2` at `f98e7b6b44d5a2f1bcd1932d5576fc6e5215bcc4`.
- Imported runtime delta: PR 4810 Alibaba compatibility commits `f6520a996` and `7d7cf46e7`, cherry-picked with provenance as `b7b3a10f5` and `3ba267dd3`. Plugin code and its original tests are identical to the production predecessor.
- Proposed additional candidate delta: exact-model Wan 2.7 image generation routing guard for stale persisted `qwen.sync_image_models`; see `docs/patches.md`. This has not been merged into the tested image or deployed.
- Other fork changes: maintenance rules, patch register, this handoff, manual GHCR/Tencent publishing workflow, exclusions for fork tags in official publishing workflows, and a focused Qwen Claude regression test.
- Official rc.33 is a prerelease and its release notes do not recommend production use. This candidate is for acceptance testing first.

## Verification Performed

- `go test ./plugins ./pkg/jsplugin ./relay/channel/task/jsplugin ./relay/helper ./relay/channel/claude ./relay`: passed.
- `go test ./relay/channel/claude -run TestForkQwenMaxSmallTokenBudgetPreservesNativeModel -v`: passed. No model exemption was added: `qwen3.8-max` with streaming and `max_tokens: 64` retains its model name and budget without injected thinking through suffix processing and the Claude adaptor. This is a local conversion test, not a live provider request.
- `go test ./service ./setting/... ./model`: passed.
- In `relaykit/`, `GOWORK=off go test ./...` and `GOWORK=off go build ./...`: passed.
- `TEST_MYSQL_DSN='<isolated MySQL DSN>' TEST_POSTGRES_DSN='<isolated PostgreSQL DSN>' go test ./model -count=1`: passed against local disposable MySQL 8.0.46 and PostgreSQL 15.18, plus embedded SQLite 3.50.4. Ports: 127.0.0.1:13316 and 127.0.0.1:15436; database: `newapi_test`. Test credentials are local fixtures, not production credentials.
- Compared schema/model definitions, startup migration code, and Go dependencies with the production predecessor: no changes. Two model files change routing-name normalization only.
- For the proposed Wan 2.7 image guard: `go test ./relay/channel/ali -count=1` passed on a branch based on this rc.33 candidate. Its regression test first failed under a simulated old persisted sync-model list, then passed with the scoped fix. This does not verify the live gateway setting or image generation.

## Operator Acceptance Required

Image publication is not deployment rehearsal. The following have NOT been performed by the agent and remain release gates:

1. Restore a representative production backup into isolated test main/log databases and use an isolated cache. Control outbound access so historical jobs cannot execute against production providers unintentionally.
2. Start the candidate once, inspect migration logs and compare schema/data, then restart and confirm migration idempotency. No new manual schema migration was identified relative to the production predecessor; inspect actual schema rather than blindly repeating BIGINT changes.
3. Exercise the real client Messages and Chat Completions routes for `qwen3.8-max`, `qwen3.8-flash`, `deepseek-v4-flash-0731`, and `deepseek-v4-pro-0813`, including configured aliases. Verify the original 64-token Qwen case without relying on the temporary suffix exemption in the isolated environment. Previous Unsupported model failures require separate upstream-route validation.
4. Verify Alibaba video creation, historical task polling, results, decimal durations, pre-consume, settlement and failure refunds. Check both JSON and multipart requests and current prices.
5. Rehearse rollback against the upgraded test database and configuration. Do not assume an older image alone is sufficient; restoring a snapshot after new writes requires reconciliation.
6. Record operator results, exact tested image digest and acceptance before production promotion. Keep production `deploy/main` and the existing release tags unchanged until acceptance.
7. If the proposed Wan 2.7 image guard is included, inspect the candidate's effective Alibaba channel type, upstream model mapping, base URL and persisted `qwen.sync_image_models`. Then call `wan2.7-image` and `wan2.7-image-pro` through `/v1/images/generations` and verify actual image output. The same HTTP 400 can have other gateway configuration causes; the local regression test alone cannot close issue #3522.

Publish candidate images under a `test-` tag prefix. Record the immutable build SHA and digest from the workflow run in the acceptance record; do not deploy an unverified rebuilt image under the same version.
