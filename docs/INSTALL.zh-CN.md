# 安装与升级

在 [GitHub Releases](https://github.com/asoming/deskplan/releases/latest) 下载对应系统的安装包。

- **Windows x64**：运行 `.exe` 安装向导。
- **macOS**：Apple Silicon 选择 arm64，Intel 选择 x64。打开 `.dmg`，将“日序”拖入 Applications。
- **Debian / Ubuntu x64**：软件安装器打开 `.deb`，或 `sudo apt install ./DeskPlan-1.0.11-linux-x64.deb`。
- **其他 Linux x64**：解压 `.tar.gz` 到用户可写目录，运行其中的 `rixu` 可执行文件。支持的运行时要求以发行说明为准。

Windows 安装包未做 Authenticode 签名；macOS 使用临时签名且未公证。请确认下载来自本仓库并核对 SHA256SUMS.txt。系统限制阻止运行时遵循系统官方的单个应用验证流程，不要关闭全局安全保护。

首次启动后在设置中选择中文 / English。Linux 通过 X11 / XWayland 运行，窗口定位可能因桌面环境而异。

## 保留数据升级

1. 在设置中导出备份；附件备份仅包含原路径。
2. 1.0.10 及以前需要手动覆盖安装一次 1.0.11 或更新版本，无需卸载。
3. 新版在设置里检测、下载更新，通过校验后由你选择安装并重启。安装时需要可写的目标目录或系统授权。

安装标识及原有数据目录保持不变；旧的 `rixu` 可执行文件名是兼容标识，应用英文名为 DeskPlan。
