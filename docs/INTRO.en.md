# Rixu: a quiet place for your plan

Rixu addresses a small, familiar need: you do not want to open a complex project-management system. You want to see what to do now, how the week is arranged, and what is approaching its deadline.

Four colored zones express handling priority: Now, Soon, Planned and Later. These are four priority tiers, not a two-axis importance matrix. Deadline labels change color as time runs out; Soon tasks move visually into Now with 48 hours or less remaining.

Switch to Today when it is time to act, placing up to three priorities at the top. Switch to Week when it is time to plan, using estimated minutes to spot overloaded days. Planned dates stay separate from deadlines, so rearranging a day does not erase a real commitment.

Capture a thought with a global shortcut, press Enter, and return to your work. Drop files onto tasks. Break a larger task into checklist steps, repeat routine work, or snooze a reminder without changing the deadline.

Rixu can become a quiet layer on your desktop: subtle borders, independent text and background transparency, sidebar icons that appear on sidebar hover, and a mini window containing the current task and the next two. Minimalism should not mean losing access to your controls.

Your tasks live on your computer. There is no account requirement; the app works offline, keeps backups, and exports JSON or CSV. Version 1.0 focuses on individual desktop planning, without cloud sync or team collaboration.

Build workflows cover Windows, Linux, Apple Silicon Macs and Intel Macs. See the [release](https://github.com/asoming/rixu/releases/latest) for actual downloads, test evidence and code-signing status. The interface supports Simplified Chinese and English, with instant switching in Settings and a saved language preference. Your own task content is never translated.

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
