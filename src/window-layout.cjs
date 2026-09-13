'use strict';
const sizes = { compact: [760, 540], normal: [960, 640], large: [1180, 760] };
function panelBounds(settings, current, area) {
  const margin = 24;
  const [wantedWidth, wantedHeight] = settings.compactMode ? [390, 320] : sizes[settings.windowSize];
  const width = Math.min(wantedWidth, Math.max(1, area.width - margin * 2));
  const height = Math.min(wantedHeight, Math.max(1, area.height - margin * 2));
  const clampX = x => Math.max(area.x, Math.min(x, area.x + area.width - width));
  const clampY = y => Math.max(area.y, Math.min(y, area.y + area.height - height));
  return {
    x: clampX(settings.windowPosition === 'top-right' ? area.x + area.width - width - margin - settings.desktopInset : current.x),
    y: clampY(settings.windowPosition === 'top-right' ? area.y + margin : current.y), width, height,
  };
}
function sameBounds(a, b) { return ['x', 'y', 'width', 'height'].every(key => a[key] === b[key]); }
module.exports = { panelBounds, sameBounds };
