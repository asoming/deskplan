"""Downscale the generated calendar/planner app icon without creative edits."""
from pathlib import Path
from PIL import Image
assets = Path(__file__).resolve().parents[1] / 'src' / 'assets'
image = Image.open(assets / 'icon.png').convert('RGBA')
for size in (32, 64, 128, 256, 512):
    image.resize((size, size), getattr(Image, 'Resampling', Image).LANCZOS).save(assets / f'icon-{size}.png')
