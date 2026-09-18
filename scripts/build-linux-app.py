"""Create an installable Linux application bundle and Debian staging tree."""
import json
from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
package = json.loads((root / 'package.json').read_text())
version = package['version']
for size in (32, 64, 128, 256, 512):
    if not (root / 'src' / 'assets' / f'icon-{size}.png').exists():
        raise SystemExit('Generate app icons before packaging.')
bundle = root / 'dist' / f'rixu-{version}-linux-x64'
stage = root.parents[1] / 'work' / f'rixu-deb-{version}'
if bundle.exists() or stage.exists():
    raise SystemExit('Build directories already exist; use a new version or move the old build first.')
shutil.copytree(root / 'node_modules' / 'electron' / 'dist', bundle)
(bundle / 'electron').rename(bundle / 'rixu')
app = bundle / 'resources' / 'app'
app.mkdir(parents=True)
shutil.copytree(root / 'src', app / 'src')
(app / 'package.json').write_text(json.dumps({key: package[key] for key in ('name', 'productName', 'version', 'main', 'desktopName')}, ensure_ascii=False, indent=2))
shutil.copy2(root / 'README.md', bundle / '使用说明.md')
(bundle / '启动日序.sh').write_text('#!/bin/sh\napp_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$app_dir/rixu" "$@"\n')
(bundle / '启动日序.sh').chmod(0o755)

application = stage / 'opt' / 'rixu'
shutil.copytree(bundle, application)
desktop = stage / 'usr' / 'share' / 'applications' / 'io.rixu.desktop'
desktop.parent.mkdir(parents=True)
desktop.write_text('''[Desktop Entry]
Type=Application
Version=1.0
Name=日序
Name[en]=DeskPlan
GenericName=桌面计划
Comment=今天、本周、四象限与快捷记录
Exec=/opt/rixu/rixu
Icon=rixu
Terminal=false
Categories=Office;
Keywords=任务;计划;日序;DeskPlan;Todo;Calendar;
StartupNotify=true
StartupWMClass=io.rixu
''')
for size in (32, 64, 128, 256, 512):
    icon = stage / 'usr' / 'share' / 'icons' / 'hicolor' / f'{size}x{size}' / 'apps' / 'rixu.png'
    icon.parent.mkdir(parents=True)
    shutil.copy2(root / 'src' / 'assets' / f'icon-{size}.png', icon)
control = stage / 'DEBIAN'
control.mkdir()
size_kb = sum(p.stat().st_size for p in stage.rglob('*') if p.is_file()) // 1024
(control / 'control').write_text(f'''Package: rixu
Conflicts: fourfold
Replaces: fourfold
Version: {version}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: DeskPlan local build <noreply@localhost>
Installed-Size: {size_kb}
Depends: libgtk-3-0 | libgtk-3-0t64, libnss3, libgbm1, libasound2 | libasound2t64, libxss1, libx11-6, libxkbcommon0
Description: DeskPlan desktop task planner
 A local desktop planner with urgency quadrants, file attachments,
 calendar scheduling, reminders and adjustable background transparency.
''')
for script in ('postinst', 'postrm'):
    p = control / script
    p.write_text('#!/bin/sh\nset -e\nif command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database /usr/share/applications || true; fi\nif command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi\nexit 0\n')
    p.chmod(0o755)
print(json.dumps({'bundle': str(bundle), 'deb_stage': str(stage)}, ensure_ascii=False))
