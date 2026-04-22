export interface WorldViewport {
  left: number
  top: number
  right: number
  bottom: number
}

export function createWorldViewport(
  screenWidth: number,
  screenHeight: number,
  zoom: number,
  pan: { x: number; y: number },
  padding = 0,
): WorldViewport {
  const safeZoom = zoom === 0 ? 1 : zoom
  const worldPadding = padding / safeZoom
  return {
    left: (-pan.x) / safeZoom - worldPadding,
    top: (-pan.y) / safeZoom - worldPadding,
    right: (screenWidth - pan.x) / safeZoom + worldPadding,
    bottom: (screenHeight - pan.y) / safeZoom + worldPadding,
  }
}

export function rectIntersectsViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  vp: WorldViewport,
): boolean {
  return !(
    x + width < vp.left ||
    x > vp.right ||
    y + height < vp.top ||
    y > vp.bottom
  )
}

export function pointInViewport(x: number, y: number, vp: WorldViewport): boolean {
  return x >= vp.left && x <= vp.right && y >= vp.top && y <= vp.bottom
}

function regionCode(x: number, y: number, vp: WorldViewport): number {
  let code = 0
  if (x < vp.left) code |= 1
  else if (x > vp.right) code |= 2
  if (y < vp.top) code |= 4
  else if (y > vp.bottom) code |= 8
  return code
}

export function lineIntersectsViewport(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  vp: WorldViewport,
): boolean {
  let ax = x1
  let ay = y1
  let bx = x2
  let by = y2

  let codeA = regionCode(ax, ay, vp)
  let codeB = regionCode(bx, by, vp)

  while (true) {
    if ((codeA | codeB) === 0) return true
    if ((codeA & codeB) !== 0) return false

    const outCode = codeA !== 0 ? codeA : codeB
    let x = 0
    let y = 0

    if ((outCode & 8) !== 0) {
      if (by === ay) return false
      x = ax + ((bx - ax) * (vp.bottom - ay)) / (by - ay)
      y = vp.bottom
    } else if ((outCode & 4) !== 0) {
      if (by === ay) return false
      x = ax + ((bx - ax) * (vp.top - ay)) / (by - ay)
      y = vp.top
    } else if ((outCode & 2) !== 0) {
      if (bx === ax) return false
      y = ay + ((by - ay) * (vp.right - ax)) / (bx - ax)
      x = vp.right
    } else {
      if (bx === ax) return false
      y = ay + ((by - ay) * (vp.left - ax)) / (bx - ax)
      x = vp.left
    }

    if (outCode === codeA) {
      ax = x
      ay = y
      codeA = regionCode(ax, ay, vp)
    } else {
      bx = x
      by = y
      codeB = regionCode(bx, by, vp)
    }
  }
}

export function polylineIntersectsViewport(
  points: ReadonlyArray<{ x: number; y: number }>,
  vp: WorldViewport,
): boolean {
  if (points.length === 0) return false
  if (points.some((p) => pointInViewport(p.x, p.y, vp))) return true

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (lineIntersectsViewport(a.x, a.y, b.x, b.y, vp)) return true
  }
  return false
}
