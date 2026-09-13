# Validation / 验证说明

Rixu 1.0.4 uses three layers of validation. Actual platform results are attached to the release; workflow success must refer to its exact commit.

## Unit and persistence tests

`npm test` covers 43 tests (one symlink case is skipped on Windows): exact 48-hour urgency transitions, reminder thresholds and deduplication, time-zone-equivalent instants, atomic write failures, backup recovery, undo, attachment preservation, schema migration, top-three limits, schedule/deadline independence, recurrence anchors and missed dates, checklist resets, snooze semantics, and CSV escaping, canonical renderer URL validation, monitor geometry, desktop margins, manual placement and legacy topmost migration.

## Native UI tests

`npm run test:desktop` exercises actual Electron windows and the isolated preload bridge: editor create/update, HTML escaping, calendar selection, task drag, real disk-file drop, deadline promotion, completion/undo, missing attachments, transparent backgrounds and light/dark layouts.

`npm run test:release` exercises desktop blend mode, checklist editing, recurrence generation/undo, recoverable mouse-through locking and independent transparent surfaces/readable text. It also tests right-corner docking, reserved desktop space, a fixed yet interactive panel, manual position preservation, both panels staying non-topmost, no focus stealing during a background check, and accessible translated sidebar icons without a panel logo. `npm run test:planner` additionally covers Today reordering, the three-priority limit, the seven-day workload view, quick capture and mini-window behavior.

Source tests use an isolated temporary data directory. Screenshots contain generated examples only. Set `RIXU_ARTIFACTS_DIR` to save screenshots and JSON results. Global shortcuts can be occupied by another running instance; the planner test uses the alternative capture shortcut.

## Packaged app tests

`npm run test:package` launches the distributable's application executable, loads the actual ASAR renderer/preload, creates a task through the UI, verifies schema 3 on disk and checks clean exit. It supports an explicit executable path for testing extracted or installed distributions.

The four-job workflow runs on Linux x64, Windows x64, Apple Silicon macOS and Intel macOS. The default package smoke test keeps the Electron sandbox enabled. A CI-only `RIXU_CI_NO_SANDBOX=1` override exists for environments that cannot expose user namespaces; any use must be recorded in its JSON report rather than represented as a sandboxed run.

## What automation does not prove

Passing builds and native tests do not prove trusted developer signatures, Apple notarization, compatibility with every Linux compositor, or delivery and click behavior of every OS notification service. Signing state and environment-specific limits remain explicit in README and release notes.

1.0.2 本地桌面回归在独立 Xvfb + Openbox 虚拟显示运行，使用临时数据，没有操作或重启用户正在使用的桌面 App。后续 GUI 测试同样必须使用隔离显示或 CI；跨平台最终结果以 GitHub Actions 及发行页附带报告为准。

## Language switching

`npm run test:language` tests live English/Chinese switching through Settings, all planner views and the calendar, editing without losing drafts, quick capture preferences, localized validation/native dialogs, and task preservation. Packaged and installed app smoke tests fully quit and restart the executable, checking that English and the original task survive. Each platform stores `language-test.json`.

## Desktop layer and directories

The release UI suite verifies native stack order on Linux and Windows after focus, raise and mini-mode requests. Linux also performs real mouse and keyboard input via XTest on the isolated display and verifies the panel remains below a covering window. The desktop suite drops an actual disk directory through Chromium and the preload bridge, opens and relinks it, and verifies task removal leaves its contents intact. Unit tests cover workspace files and folder metadata persistence.
