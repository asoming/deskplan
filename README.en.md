<p align="center"><img src="src/assets/icon-128.png" width="88" alt="Rixu icon"></p>
<h1 align="center">Rixu · 日序</h1>
<p align="center">Keep your plan on the desktop. Keep your attention on today.</p>
<p align="center"><a href="README.md">简体中文</a> · <a href="https://github.com/asoming/rixu/releases/latest">Download</a> · <a href="docs/INTRO.en.md">Introduction</a> · <a href="docs/RESEARCH.zh-CN.md">User research</a></p>

Rixu is a minimal, local-first desktop planner. Today, Week, four urgency zones and Inbox share the same tasks. Drop in files, plan your days, adjust transparency, and switch to a small panel that never stays on top when you want to focus.

No account. Works offline. No ads, telemetry, or background cloud synchronization. The app and documentation support Chinese and English. Open **Left sidebar settings icon → Settings and backup → 语言 / Language** to switch instantly. Your choice is remembered; your task content stays unchanged.

![Rixu desktop blend mode](docs/images/english-planner.png)

## Belong on the desktop

Desktop blend mode softens borders, shadows and large colored surfaces. Sidebar icons hide when idle and appear when hovering over the sidebar or focusing it with the keyboard. Background and text transparency are independent, each adjustable from 0–100%.

Right-click the panel to fix/unlock its position, open settings or quit. Once unlocked, drag empty areas or quadrant headings to move it. Tasks and file drops remain interactive.

## Plan today and the week

| View | What it does |
| --- | --- |
| **Today** | Pick up to three priorities, drag to reorder, and estimate minutes; unfinished earlier plans remain clearly labeled |
| **Week** | Monday–Sunday columns with estimated workload and unestimated counts; flag days exceeding your chosen capacity |
| **Urgency zones** | Red: Now; amber: Soon; blue: Planned; sage: Later; drop real files to create or attach tasks |
| **Inbox** | Capture first, schedule later; global quick capture with `Ctrl / Cmd + Shift + Space` |
| **Mini window** | The current task and the next two, without staying on top; completed tasks are replaced automatically |

**Planned dates and deadlines are separate.** Dragging in Week changes the planned day. Dragging onto the deadline calendar changes the deadline. Soon tasks automatically appear in Now when no more than **48 hours** remain, and are reevaluated when rescheduled.

## Small features for daily friction

- **Recurring tasks:** daily, weekdays, weekly or monthly. Completion creates the next future occurrence, skipping missed dates instead of creating a backlog. A monthly 31st clamps to a shorter month’s end and returns to the 31st afterward.
- **Checklists:** up to 30 steps per task with progress on the card. A new recurrence resets its checklist.
- **Gentle reminders:** opt-in system notifications; defer, keep, cancel, or snooze for 30 minutes without changing the deadline. Reminders stop when the application is fully closed.
- **Local reliability:** atomic writes, undo, trash, seven rolling daily backups and a backup before restore.
- **Portable data:** full JSON backups and readable CSV export. Attachments are references to original files; backups do not include file contents and Rixu does not delete originals.

## Downloads

Get the matching asset from [GitHub Releases](https://github.com/asoming/rixu/releases/latest).

| Platform | Asset |
| --- | --- |
| Debian / Ubuntu x64 | `Rixu-1.0.10-linux-x64.deb` |
| Other Linux x64 | `Rixu-1.0.10-linux-x64.tar.gz` |
| Windows x64 | `Rixu-1.0.10-windows-x64-setup.exe` |
| macOS Apple Silicon | `Rixu-1.0.10-mac-arm64.dmg` or `.zip` |
| macOS Intel | `Rixu-1.0.10-mac-x64.dmg` or `.zip` |

Use the Windows installer, drag the macOS app into Applications, or install the Debian package with your software manager / `sudo apt install ./Rixu-1.0.10-linux-x64.deb`.

Release notes record actual build, test and signing status. Developer signing certificates are not configured: Windows builds are not Authenticode-signed; macOS builds are ad-hoc signed and not Apple-notarized. Operating-system checks may appear on first launch. Do not disable global operating-system security protections.

## Shortcuts

- Global capture: `Ctrl / Cmd + Shift + Space`; switch to `Alt + Shift + Space` in Settings if occupied.
- In-app new task / search / undo: `Ctrl / Cmd + N` / `F` / `Z`.
- Dismiss capture: `Esc`.

## Development

Node.js 22.12+ is required; CI uses Node.js 24. Linux source builds also need a C++ compiler, make, Python 3 and libx11-dev; packaged apps do not need build tools.

```sh
npm ci
npm start
npm test
npm run test:desktop
npm run test:release
npm run test:language
npm run package:linux  # Linux host
npm run package:win    # Windows host
npm run package:mac    # macOS host
npm run test:package
```

Native UI tests require a desktop session. CI builds and tests Linux x64, Windows x64, macOS arm64 and macOS x64, retaining screenshots and test reports. See [Testing](TESTING.md) and [Releasing](docs/RELEASING.md).

For upgrades, the existing `四格` directory under the operating system’s application-data folder is intentionally retained. Schema 3 preserves older tasks, file paths and reminder records. Restore a compatible backup before downgrading. Tests use an isolated `RIXU_DATA_DIR`; never point tests at real user data.

## Scope

No accounts, cloud sync, collaboration, natural-language parsing or two-way system-calendar sync. Linux positioning depends on the window manager; Linux builds select X11/XWayland for the interactive below-app layer. Automated native tests do not replace manual verification of every desktop environment, system permission or notification service.

Report problems in [Issues](https://github.com/asoming/rixu/issues). Source is publicly viewable; no open-source license is currently granted. Copyright remains with the author. Third-party components retain their respective licenses.

## Top-right docking and a fixed position (1.0.2)

Rixu starts flush with the top-right corner of the screen work area, with no outer window or panel gap; fresh installs use 760 × 540. Position is fixed by default while task editing and file drops remain available. Use the pin in the left sidebar to unlock, drag the empty part of the left sidebar, then fix the position again. The diagonal arrow docks it flush at the top right and resets the right margin to zero. Settings can reserve an additional 0–480 px on the right. Mini mode keeps the same corner; manual placement is restored when expanded. Monitor changes keep the window in the available work area.

The main panel, mini panel and quick capture never stay on top. Legacy topmost preferences are disabled. Controls live in a narrow left sidebar with translated hover labels; the panel no longer shows a brand logo. The application launcher retains its icon.

Fixed position prevents movement only. The mini rail has just New task and Expand; other controls are in the context menu. GUI tests use isolated displays or CI, and local upgrades follow the user-authorized backup-and-install-first workflow.

Version 1.0.3 removes the entire top caption row; the empty part of the sidebar becomes the unlocked drag area. Flush docking still respects the operating system menu bar and taskbar.

## 1.0.4 Desktop layer and project folders

The main and mini panels stay below ordinary application windows, including when clicked or focused. Linux uses an interactive layer above desktop icons and below ordinary apps; macOS uses the native desktop type, and Windows preserves bottom placement before z-order changes are applied. Explicitly opened quick capture and system file pickers remain transient interaction windows.

Drop a folder, project directory or `.code-workspace` file into a zone or onto a task. Folder names keep their dots and use a folder icon; click the attachment name to open it in the file manager. The editor includes Add folder, and missing directories can be relinked. Only paths are stored; directories are never recursively scanned, copied or deleted when a task is removed.

## 1.0.5 Click and drop fix

Fixes the Linux desktop icon surface intercepting planner clicks and file drops. The order is desktop/icons < Rixu < ordinary apps. Fully transparent backgrounds remain interactive; fixing the window position does not enable click-through. Linux runs through X11/XWayland.

## 1.0.6 Simpler controls and update notices

Removes mouse-through and its shortcut, plus minimize and close buttons. Unlock position and drag empty panel areas or quadrant headings. Mini mode has only New task and Expand; right-click for position, settings and Quit.

Checks stable GitHub releases after startup and every six hours. An update dialog appears when you return to Rixu and no editor dialog is open, once per version. Settings → Software updates supports manual checks, retry and disabling automatic checks. It opens GitHub for release notes and installers; it does not install automatically or upload tasks/files. GitHub's official latest-release link provides a fallback when the public API is rate limited.

## 1.0.7 Download and install updates in the app

Settings → Software updates → Check for updates → Download update. Downloads show progress and support cancellation and retry. After SHA256 verification, choose Install and restart or install later; downloaded packages survive app restarts. Tasks and settings receive an additional backup before installation, and Quick Capture drafts are retained. Rixu never downloads, installs or restarts automatically.

Writable user-local Linux installations are replaced with the previous runtime retained; system deb installations request system authorization. Windows updates the existing installation directory. macOS updates an installed Applications bundle and verifies signature integrity. The installation folder must be writable; otherwise download from GitHub and install manually. Ad-hoc macOS signatures do not establish publisher identity or notarization. Versions 1.0.6 and earlier need a one-time manual installation of this release before they can update in the app.

## 1.0.8 Checklists on task cards

Task cards now show checklist steps with checkboxes that save immediately. Available in Quadrants, Today, Week, Inbox and mini mode. The first three steps appear by default; expand to see the rest. Long text wraps, progress stays in sync with task details, and changes support Undo. Finishing every step leaves the parent task active until you complete it yourself.

Fixes cards previously showing only a count such as “0/2” without the actual steps. Chinese/English labels and independent text transparency are supported.

## 1.0.9 Tray-only presence

Rixu no longer takes up a taskbar or macOS Dock slot. The desktop planning panel remains visible and interactive. On Linux, both the panel and quick capture are also excluded from the window switcher; these hints survive focus, mini mode and hide/show. The system tray provides Show Rixu, Quick capture, Settings and backup, Restore visibility, Fix position and Quit.

## 1.0.10 Show the planner at login

Autostart now displays the desktop panel immediately, without needing Show Rixu from the tray. It does not take focus and keeps its tray-only presence below other apps. Legacy --hidden login entries also show the panel; existing enabled login entries are refreshed on launch without toggling the setting. Tasks, checklists and preferences are preserved.
