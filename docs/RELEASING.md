# Build and release

The build workflow runs unit tests, native UI tests, creates distributables and starts the packaged app on Linux x64, Windows x64, macOS arm64 and macOS x64. Release publication is separate: publish only assets from a successful workflow run for the exact release commit.

1. Change the version in `package.json` and the lockfile. Run the test suites and update bilingual documentation.
2. Push the commit. Wait for **every** `Build and test desktop releases` matrix job to succeed.
3. Download the four `release-*` artifacts and retain the `tests-*` reports. Verify artifact names and contents; create SHA-256 checksums over the seven distributables.
4. Run the `Publish verified release` workflow on the exact successful build commit, passing its build run ID and version. It rechecks the workflow identity, commit, version and all four jobs, downloads the verified artifacts, creates checksums and publishes the release tag with bilingual notes. Do not silently label a failed or untested build as verified.

## Signing credentials

The pipeline works without certificates, but the resulting Windows executable has no Authenticode publisher signature and the macOS app is ad-hoc signed, not notarized. This limitation must stay visible in release notes.

For a signed release, the repository owner can configure GitHub Actions secrets:

- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- macOS: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

Do not commit certificates, tokens or passwords. The builder enables Developer ID signing / hardened runtime and notarization only when the corresponding credentials are supplied. Verify signatures and notarization on the produced artifacts before calling a release signed.

[Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) · [electron-builder GitHub Actions](https://www.electron.build/docs/github-actions/) · [GitHub runner platforms](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

## Supported scope

Linux builds target Debian-compatible x64 desktops and provide a tar archive. Windows has a per-user NSIS installer for x64. Mac builds provide DMG and ZIP for Intel and Apple Silicon. Electron is pinned in `package-lock.json`; consult its platform support requirements before extending the support matrix.

Source test screenshots use generated example tasks only. Unit tests, UI tests and package tests each use isolated data directories. Never test against a real task database.
