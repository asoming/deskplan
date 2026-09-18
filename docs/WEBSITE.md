# Website and demo maintenance / 网站与演示维护

The bilingual product website is stored in `site/` and deployed to https://asoming.github.io/deskplan/ by `.github/workflows/site.yml`. The Chinese page is `site/zh-CN/index.html`. The workflow publishes only `site/`, never the repository root or task data.

网站源码位于 `site/`，由 GitHub Pages 自动发布；只部署该目录，不发布任务数据或仓库其他文件。

## Editing

- Edit both HTML pages together. Preserve canonical / hreflang links, metadata, sitemap and the SoftwareApplication JSON-LD.
- Update the visible release version and all five download links only when the release assets exist. Keep the “all releases” link as a fallback.
- Use `node scripts/check-site.cjs` to validate links and metadata. Preview with a local static server and check 320 px, 390 px, 768 px and desktop layouts. Verify play/stop and keyboard focus.
- The demo is opt-in and stops after 15 seconds. It never auto-plays on page load.
- No analytics or third-party scripts are included. GitHub Pages itself is the hosting provider.

## Re-record the demo

Use an isolated display and a temporary output directory:

```sh
RIXU_ARTIFACTS_DIR=/tmp/deskplan-frames-en npx electron scripts/capture-demo.cjs en
RIXU_ARTIFACTS_DIR=/tmp/deskplan-frames-zh npx electron scripts/capture-demo.cjs zh-CN
```

On Linux, run those commands inside Xvfb with a window manager. The script creates its own sample task directory, verifies a real file-drop event creates an attachment, and saves seven PNG frames plus `frames.json` (durations total 15 seconds). It also updates the static planner screenshots in `site/assets/`.

Encode the frames as GIF with the recorded durations using Pillow or an equivalent encoder. Keep the GIFs small, inspect every stage, and do not use screenshots of real personal tasks. The published demos were recorded from version 1.0.11 using sample data.

## Share image

`site/assets/social-preview.png` is 1280 × 640 and under 1 MB. The website uses it in Open Graph metadata. GitHub's repository Social preview is a separate setting: Settings → General → Social preview → Edit → Upload an image. Updating the PNG alone does not change that repository setting.

仓库分享封面与网站分享封面是两个设置；替换文件后，如有需要应同步在 GitHub 仓库设置里上传。
