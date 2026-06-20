export const GRID_SIZE = 300
export const MIN_CELL_SCREEN_PX = 10
export const MAX_CELL_SCREEN_PX = 550

// 1° per macro cell at the global scale
export const MACRO_CELL_SIZE = GRID_SIZE
// ~11 m micro cells (~0.0001°)
export const MICRO_CELL_DEGREES = 1e-4
export const MICRO_CELL_SIZE = GRID_SIZE * MICRO_CELL_DEGREES

export const MACRO_ZOOM_MAX = 0.25
export const MICRO_ZOOM_MIN = 80

export const MIN_ZOOM = MIN_CELL_SCREEN_PX / GRID_SIZE
export const MAX_ZOOM = Math.max(
  MAX_CELL_SCREEN_PX / GRID_SIZE,
  MIN_CELL_SCREEN_PX / MICRO_CELL_SIZE,
)

export const WORLD_WIDTH = 360 * GRID_SIZE
export const WORLD_HEIGHT = 180 * GRID_SIZE

export type WorldPoint = { x: number; y: number }
export type LatLng = { lat: number; lng: number }

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function latLngToWorldPrecise({ lat, lng }: LatLng): WorldPoint {
  return {
    x: ((lng + 180) / 360) * WORLD_WIDTH,
    y: ((90 - lat) / 180) * WORLD_HEIGHT,
  }
}

/** @deprecated Use latLngToWorldPrecise — kept for compatibility */
export function latLngToWorld(latLng: LatLng): WorldPoint {
  return latLngToWorldPrecise(latLng)
}

export function worldToLatLng({ x, y }: WorldPoint): LatLng {
  return {
    lng: (x / WORLD_WIDTH) * 360 - 180,
    lat: 90 - (y / WORLD_HEIGHT) * 180,
  }
}

export function snapToCellSize(
  x: number,
  y: number,
  cellSize: number,
): WorldPoint {
  return {
    x: Math.floor(x / cellSize) * cellSize,
    y: Math.floor(y / cellSize) * cellSize,
  }
}

/** @deprecated Use snapToCellSize(x, y, MACRO_CELL_SIZE) */
export function snapToCell(x: number, y: number): WorldPoint {
  return snapToCellSize(x, y, MACRO_CELL_SIZE)
}

export function displayCellSizeForZoom(zoom: number): number {
  if (zoom <= MACRO_ZOOM_MAX) return MACRO_CELL_SIZE
  if (zoom >= MICRO_ZOOM_MIN) return MICRO_CELL_SIZE

  const t =
    (zoom - MACRO_ZOOM_MAX) / (MICRO_ZOOM_MIN - MACRO_ZOOM_MAX)
  const logMacro = Math.log(MACRO_CELL_SIZE)
  const logMicro = Math.log(MICRO_CELL_SIZE)
  return Math.exp(logMacro + t * (logMicro - logMacro))
}

/** Grid lines use a slightly coarser step when cells would be too dense on screen */
export function gridLineCellSize(zoom: number): number {
  let size = displayCellSizeForZoom(zoom)
  const minScreenPx = 20

  while (size * zoom < minScreenPx && size < MACRO_CELL_SIZE) {
    size = Math.min(size * 5, MACRO_CELL_SIZE)
  }

  return size
}

export function cellKey(x: number, y: number, cellSize = MACRO_CELL_SIZE) {
  const snapped = snapToCellSize(x, y, cellSize)
  return `${snapped.x},${snapped.y},${cellSize}`
}

function compareBoxDisplayPriority<
  T extends {
    is_active: boolean
    isSelf: boolean
    updated_at: string
  },
>(a: T, b: T) {
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
  if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
}

export function pickVisibleBoxesPerCell<
  T extends {
    world_x: number
    world_y: number
    is_active: boolean
    isSelf: boolean
    updated_at: string
  },
>(boxes: T[], cellSizeForBox: (box: T) => number): T[] {
  const byCell = new Map<string, T[]>()

  for (const box of boxes) {
    const cellSize = cellSizeForBox(box)
    const key = cellKey(box.world_x, box.world_y, cellSize)
    const group = byCell.get(key)
    if (group) group.push(box)
    else byCell.set(key, [box])
  }

  return [...byCell.values()].map((group) => {
    if (group.length === 1) return group[0]
    return [...group].sort(compareBoxDisplayPriority)[0]
  })
}

export function displayPosition(
  point: WorldPoint,
  cellSize: number,
): WorldPoint {
  return snapToCellSize(point.x, point.y, cellSize)
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

export function boundsFromPoints(
  points: WorldPoint[],
  paddingWorld = MACRO_CELL_SIZE,
): Bounds | null {
  if (points.length === 0) return null

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)

  return {
    minX: Math.min(...xs) - paddingWorld,
    minY: Math.min(...ys) - paddingWorld,
    maxX: Math.max(...xs) + paddingWorld,
    maxY: Math.max(...ys) + paddingWorld,
  }
}

/** @deprecated Use boundsFromPoints */
export function boundsFromCells(
  cells: WorldPoint[],
  paddingCells = 1,
): Bounds | null {
  return boundsFromPoints(cells, paddingCells * MACRO_CELL_SIZE)
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
  cellSize = MACRO_CELL_SIZE,
): Bounds {
  const radius = radiusCells * cellSize
  return {
    minX: center.x - radius,
    minY: center.y - radius,
    maxX: center.x + cellSize + radius,
    maxY: center.y + cellSize + radius,
  }
}

export function cellCenter(corner: WorldPoint, cellSize: number): WorldPoint {
  return {
    x: corner.x + cellSize / 2,
    y: corner.y + cellSize / 2,
  }
}
