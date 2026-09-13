# Validation / 验证说明

Rixu 1.0.0 uses three layers of validation. Actual platform results are attached to the release; workflow success must refer to its exact commit.

## Unit and persistence tests

`npm test` covers 33 tests: exact 48-hour urgency transitions, reminder thresholds and deduplication, time-zone-equivalent instants, atomic write failures, backup recovery, undo, attachment preservation, schema migration, top-three limits, schedule/deadline independence, recurrence anchors and missed dates, checklist resets, snooze semantics, and CSV escaping.

## Native UI tests

`npm run test:desktop` exercises actual Electron windows and the isolated preload bridge: editor create/update, HTML escaping, calendar selection, task drag, real disk-file drop, deadline promotion, completion/undo, missing attachments, transparent backgrounds and light/dark layouts.

`npm run test:release` exercises desktop blend mode, checklist editing, recurrence generation/undo, recoverable mouse-through locking and independent transparent surfaces/readable text. `npm run test:planner` additionally covers Today reordering, the three-priority limit, the seven-day workload view, quick capture and mini-window behavior.

Source tests use an isolated temporary data directory. Screenshots contain generated examples only. Set `RIXU_ARTIFACTS_DIR` to save screenshots and JSON results. Global shortcuts can be occupied by another running instance; the planner test uses the alternative capture shortcut.

## Packaged app tests

`npm run test:package` launches the distributable's application executable, loads the actual ASAR renderer/preload, creates a task through the UI, verifies schema 3 on disk and checks clean exit. It supports an explicit executable path for testing extracted or installed distributions.

The four-job workflow runs on Linux x64, Windows x64, Apple Silicon macOS and Intel macOS. The default package smoke test keeps the Electron sandbox enabled. A CI-only `RIXU_CI_NO_SANDBOX=1` override exists for environments that cannot expose user namespaces; any use must be recorded in its JSON report rather than represented as a sandboxed run.

## What automation does not prove

Passing builds and native tests do not prove trusted developer signatures, Apple notarization, compatibility with every Linux compositor, or delivery and click behavior of every OS notification service. Signing state and environment-specific limits remain explicit in README and release notes.

本机 Linux 已验证真实 Ctrl + Shift + 空格唤起与 Esc 收起、透明面板、任务文件拖入、置顶小窗和持久化。跨平台最终结果以 GitHub Actions 及发行页附带报告为准；不把“配置了工作流”等同于“构建已通过”。
