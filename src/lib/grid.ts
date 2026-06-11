export const GRID_SIZE = 300
export const MIN_CELL_SCREEN_PX = 10
export const MIN_ZOOM = MIN_CELL_SCREEN_PX / GRID_SIZE
export const MAX_CELL_SCREEN_PX = 550
export const MAX_ZOOM = MAX_CELL_SCREEN_PX / GRID_SIZE

// Equirectangular world: 360° lng × 180° lat, one 300px cell per degree
export const WORLD_WIDTH = 360 * GRID_SIZE
export const WORLD_HEIGHT = 180 * GRID_SIZE

export type WorldPoint = { x: number; y: number }
export type LatLng = { lat: number; lng: number }

export function snapToCell(x: number, y: number): WorldPoint {
  return {
    x: Math.floor(x / GRID_SIZE) * GRID_SIZE,
    y: Math.floor(y / GRID_SIZE) * GRID_SIZE,
  }
}

export function latLngToWorld({ lat, lng }: LatLng): WorldPoint {
  const x = ((lng + 180) / 360) * WORLD_WIDTH
  const y = ((90 - lat) / 180) * WORLD_HEIGHT
  return snapToCell(x, y)
}

export function worldToLatLng({ x, y }: WorldPoint): LatLng {
  const cx = x + GRID_SIZE / 2
  const cy = y + GRID_SIZE / 2
  return {
    lng: (cx / WORLD_WIDTH) * 360 - 180,
    lat: 90 - (cy / WORLD_HEIGHT) * 180,
  }
}

export function cellKey(x: number, y: number) {
  return `${x},${y}`
}

export function colorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 52%)`
}

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundsFromCells(
  cells: WorldPoint[],
  paddingCells = 1,
): Bounds | null {
  if (cells.length === 0) return null

  const pad = paddingCells * GRID_SIZE
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)

  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + GRID_SIZE + pad,
    maxY: Math.max(...ys) + GRID_SIZE + pad,
  }
}

export function cameraToFitBounds(
  bounds: Bounds,
  viewportWidth: number,
  viewportHeight: number,
  minZoom: number,
  maxZoom: number,
): { x: number; y: number; zoom: number } {
  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxY - bounds.minY
  const zoom = Math.min(
    viewportWidth / worldW,
    viewportHeight / worldH,
    maxZoom,
  )
  const clampedZoom = Math.max(minZoom, zoom)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  return {
    x: viewportWidth / 2 - centerX * clampedZoom,
    y: viewportHeight / 2 - centerY * clampedZoom,
    zoom: clampedZoom,
  }
}

export function nearbyBounds(
  center: WorldPoint,
  radiusCells: number,
): Bounds {
  const radius = radiusCells * GRID_SIZE
  return {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + GRID_SIZE + radius,
    maxY: center.y + GRID_SIZE + radius,
  }
}
