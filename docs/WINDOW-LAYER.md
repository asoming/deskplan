# Native window layers

The required order is desktop/icons < Rixu < ordinary application windows. Transparency and fixed positioning must not turn off input. Mouse-through remains a separate explicit, reversible command.

Linux uses a normal X11 window with `_NET_WM_STATE_BELOW`. The native Node-API module observes only its own window’s MapNotify and PropertyNotify events and requests BELOW whenever Chromium replaces the state during mapping or restore. A libuv watcher integrates X11 events into the main loop without polling timers; it is removed when the window is destroyed. It accepts only this process’s window handle. Electron uses X11 (or XWayland under a Wayland session); native Wayland stacking is not implemented. Build requirements include libx11-dev and a C++ compiler; the packaged runtime needs libX11, already declared by the deb.

Version 1.0.4 incorrectly used DESKTOP on Linux. GNOME’s desktop icon surface then stacked above Rixu and intercepted clicks and drops even though the panel remained visible. Testing only against ordinary windows did not catch it. Linux regression now creates a desktop surface, checks both sides of the ordering, clicks and types at 100% transparency, and transfers actual files/folders over Xdnd with pointer hit testing. Hide/show, focus, raise and compact transitions are covered.

macOS retains Electron’s desktop window type. Do not call setAlwaysOnTop(false) there because it resets that level to normal. Windows retains its in-process SetWindowSubclass handler, constraining WM_WINDOWPOSCHANGING before z-order changes. No background polling or injection into other processes is used.

References: [EWMH stacking order](https://specifications.freedesktop.org/wm/latest/ar01s09.html#STACKINGORDER), [Electron window types](https://www.electronjs.org/docs/latest/api/base-window), [Win32 window positioning](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos), [Node-API](https://nodejs.org/api/n-api.html).
