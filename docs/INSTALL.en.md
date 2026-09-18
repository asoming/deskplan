# Install and update

Download the matching package from [GitHub Releases](https://github.com/asoming/deskplan/releases/latest).

- **Windows x64:** run the `.exe` installer.
- **macOS:** choose arm64 for Apple Silicon or x64 for Intel. Open the `.dmg` and drag 日序 into Applications.
- **Debian / Ubuntu x64:** open the `.deb` in your software manager, or run `sudo apt install ./DeskPlan-1.0.11-linux-x64.deb`.
- **Other Linux x64:** extract the `.tar.gz` into a user-writable directory and launch its `rixu` executable. See release notes for runtime requirements.

Windows installers are not Authenticode-signed; macOS builds are ad-hoc signed and not notarized. Verify the repository and SHA256SUMS.txt. If the OS blocks launch, use its official per-app verification process; do not disable global protections.

Choose English or Simplified Chinese in Settings. Linux uses X11 / XWayland; placement depends on the desktop environment.

## Preserve data when upgrading

1. Export a backup in Settings. Attachment backups contain original paths only.
2. Versions 1.0.10 and earlier require one manual installation of 1.0.11 or newer after the repository rename. Install over the old version; no uninstall is needed.
3. Newer versions can check and download updates in Settings. After verification, choose when to install and restart. The target must be writable or system authorization is required.

Installation IDs and data directories are retained. The legacy `rixu` executable name is a compatibility identifier; the English app name is DeskPlan.
