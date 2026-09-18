# Contributing / 参与指南

DeskPlan keeps individual task planning quiet, local and easy to reach. Bug reports, documentation improvements, translations and focused fixes are welcome. The project is licensed under the [MIT License](LICENSE). Contributions submitted for inclusion are provided under the same license.

日序关注安静、本地、随手可用的个人计划。欢迎问题反馈、文档改进、翻译与明确的小范围修复。本项目采用 [MIT 许可证](LICENSE)，提交并纳入项目的贡献遵循相同许可。

## Before changing code / 修改前

- Search Issues first. For larger features, discuss the use case in an issue before implementing it.
- Keep task data local. Do not introduce telemetry, automatic uploads, forced focus, topmost windows or automatic installation.
- UI strings need both Chinese and English; preserve user-written task content.
- Preserve installation IDs, saved data and the existing update format. Do not casually rename internal identifiers.

先搜索已有 Issue；较大功能先讨论使用场景。保持本地数据、双语界面与安静运行；迁移必须保留任务和安装兼容性。

## Development and tests / 开发与测试

Use Node.js 22.12+ (24 in CI), then `npm ci`. Run `npm test` and the relevant native checks from [TESTING.md](TESTING.md). Linux native tests need X11/XWayland; use an isolated Xvfb session with a window manager. Do not use `--no-sandbox` to bypass the test environment.

Use an isolated `RIXU_DATA_DIR` and `RIXU_TEST=1` for test sessions. Never point test automation at a real user's data or desktop. Native test scripts already create temporary data. Record which platforms were actually checked; CI validates Windows, Linux and both Mac architectures.

原生测试应使用临时数据和隔离桌面，不能操作工作窗口或真实任务。网站与文档改动只需对应检查，不必发布一个新的 App 版本。

## Pull requests

Keep one clear problem per PR. Explain the behavior, verification and limitations. Include sample-data screenshots for UI changes. Do not include private paths, personal tasks, credentials, generated installers or `node_modules`.

请让一个 PR 聚焦一个问题，说明行为变化、验证与限制。界面截图只用示例数据。
