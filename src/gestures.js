export const MAX_ZOOM = 6;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function fitImage(width, height, viewportWidth, viewportHeight, rotation = 0) {
  const turned = Math.abs(rotation % 180) === 90;
  const ratio = Math.min(viewportWidth / (turned ? height : width), viewportHeight / (turned ? width : height));
  return { width: width * ratio, height: height * ratio, boundsWidth: (turned ? height : width) * ratio, boundsHeight: (turned ? width : height) * ratio };
}

export function constrainView(view, image, viewport) {
  const scale = clamp(view.scale, 1, MAX_ZOOM);
  const maxX = Math.max(0, (image.boundsWidth * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.boundsHeight * scale - viewport.height) / 2);
  return { scale, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
}

// Coordinates are relative to the center of the gesture viewport.
export function zoomAt(view, scale, startPoint, endPoint = startPoint) {
  const next = clamp(scale, 1, MAX_ZOOM);
  return { scale: next, x: endPoint.x - (startPoint.x - view.x) * next / view.scale, y: endPoint.y - (startPoint.y - view.y) * next / view.scale };
}

export function swipeDirection(dx, dy, viewportWidth, wasPinch = false) {
  const threshold = clamp(viewportWidth * .12, 45, 100);
  if (wasPinch || Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.4) return 0;
  return dx < 0 ? 1 : -1;
}
