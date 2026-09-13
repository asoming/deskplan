# Native desktop layer

Linux and macOS use Electron’s native `desktop` window type. Do not reset those windows with `setAlwaysOnTop(false)` on macOS: that resets the window level to normal. Windows uses a small in-process Node-API module and `SetWindowSubclass` to constrain `WM_WINDOWPOSCHANGING` before z-order changes are applied. It only accepts handles belonging to the current process, does not poll or inject into other applications, and removes the subclass on destruction.

References: [Electron window types](https://www.electronjs.org/docs/latest/api/base-window), [Win32 window positioning](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos), [Node-API](https://nodejs.org/api/n-api.html).

Windows native code is compiled by the root postinstall script using Electron headers. The binary is automatically unpacked outside app.asar. Source tests verify native z-order after focus and raise requests on Linux and Windows. Linux additionally clicks and types through XTest on an isolated display.
