# Rixu: a quiet place for your plan

Rixu addresses a small, familiar need: you do not want to open a complex project-management system. You want to see what to do now, how the week is arranged, and what is approaching its deadline.

Four colored zones express handling priority: Now, Soon, Planned and Later. These are four priority tiers, not a two-axis importance matrix. Deadline labels change color as time runs out; Soon tasks move visually into Now with 48 hours or less remaining.

Switch to Today when it is time to act, placing up to three priorities at the top. Switch to Week when it is time to plan, using estimated minutes to spot overloaded days. Planned dates stay separate from deadlines, so rearranging a day does not erase a real commitment.

Capture a thought with a global shortcut, press Enter, and return to your work. Drop files onto tasks. Break a larger task into checklist steps, repeat routine work, or snooze a reminder without changing the deadline.

Rixu can become a quiet layer on your desktop: subtle borders, independent text and background transparency, controls that fade when idle, a recoverable mouse-through lock, and a mini window containing the current task and the next two. Minimalism should not mean losing access to your controls.

Your tasks live on your computer. There is no account requirement; the app works offline, keeps backups, and exports JSON or CSV. Version 1.0 focuses on individual desktop planning, without cloud sync or team collaboration.

Build workflows cover Windows, Linux, Apple Silicon Macs and Intel Macs. See the [release](https://github.com/asoming/rixu/releases/latest) for actual downloads, test evidence and code-signing status. The interface supports Simplified Chinese and English, with instant switching in Settings and a saved language preference. Your own task content is never translated.

## Top-right docking and a fixed position (1.0.2)

Rixu starts at the top right of the screen work area with a 24 px margin plus 120 px reserved on the right for a column of desktop files; fresh installs use 760 × 540. Position is fixed by default while task editing and file drops remain available. Use the pin in the left sidebar to unlock, drag the top strip, then fix the position again. The diagonal arrow docks it at the top right. Settings can reserve an additional 0–480 px on the right. Mini mode keeps the same corner; manual placement is restored when expanded. Monitor changes keep the window in the available work area.

The main panel, mini panel and quick capture never stay on top. Legacy topmost preferences are disabled. Controls live in a narrow left sidebar with translated hover labels; the panel no longer shows a brand logo. The application launcher retains its icon.

Position locking does not pass clicks through. Mouse-through is a separate command. Rixu does not move desktop files and cannot automatically detect every desktop icon across operating systems. Use the right margin, manual position, mouse-through or hide the panel to make room. GUI tests run on an isolated display or in CI; updates do not automatically restart a working user instance.
