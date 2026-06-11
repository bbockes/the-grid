import { useCallback, useEffect, useRef, useState } from 'react'
import AuthPanel from './AuthPanel'
import UserBoxes from './UserBoxes'
import { useAuth } from '../context/AuthContext'
import { useLocationSharing } from '../hooks/useLocationSharing'
import {
  GRID_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  boundsFromCells,
  cameraToFitBounds,
  nearbyBounds,
  worldToLatLng,
  type WorldPoint,
} from '../lib/grid'
import './InfiniteCanvas.css'

const NEARBY_RADIUS_CELLS = 4

type Camera = { x: number; y: number; zoom: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camera: Camera,
) {
  const { x: panX, y: panY, zoom } = camera
  const gridScreen = GRID_SIZE * zoom

  ctx.clearRect(0, 0, width, height)

  const worldLeft = -panX / zoom
  const worldTop = -panY / zoom
  const worldRight = worldLeft + width / zoom
  const worldBottom = worldTop + height / zoom

  const firstX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE
  const firstY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE

  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'

  for (let wx = firstX; wx <= worldRight; wx += GRID_SIZE) {
    const sx = panX + wx * zoom
    const pixelX = Math.round(sx) + 0.5
    ctx.beginPath()
    ctx.moveTo(pixelX, 0)
    ctx.lineTo(pixelX, height)
    ctx.stroke()
  }

  for (let wy = firstY; wy <= worldBottom; wy += GRID_SIZE) {
    const sy = panY + wy * zoom
    const pixelY = Math.round(sy) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, pixelY)
    ctx.lineTo(width, pixelY)
    ctx.stroke()
  }

  if (gridScreen >= 40) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)'
    ctx.lineWidth = 1.5

    const majorEvery = 5
    const majorFirstX =
      Math.floor(firstX / (GRID_SIZE * majorEvery)) * GRID_SIZE * majorEvery
    const majorFirstY =
      Math.floor(firstY / (GRID_SIZE * majorEvery)) * GRID_SIZE * majorEvery

    for (
      let wx = majorFirstX;
      wx <= worldRight;
      wx += GRID_SIZE * majorEvery
    ) {
      const sx = panX + wx * zoom
      const pixelX = Math.round(sx) + 0.5
      ctx.beginPath()
      ctx.moveTo(pixelX, 0)
      ctx.lineTo(pixelX, height)
      ctx.stroke()
    }

    for (
      let wy = majorFirstY;
      wy <= worldBottom;
      wy += GRID_SIZE * majorEvery
    ) {
      const sy = panY + wy * zoom
      const pixelY = Math.round(sy) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, pixelY)
      ctx.lineTo(width, pixelY)
      ctx.stroke()
    }
  }
}

export default function InfiniteCanvas() {
  const { user } = useAuth()
  const {
    syncError,
    needsSetup,
    userBoxes,
    myCell,
    geoStatus,
    shareFromWorldPoint,
    retryConnection,
  } = useLocationSharing(user?.id)

  const viewportRef = useRef<HTMLDivElement>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.15 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const spaceHeldRef = useRef(false)
  const hasFocusedRef = useRef(false)

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 0.15 })
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  const updateCamera = useCallback((next: Camera) => {
    cameraRef.current = next
    setCamera(next)
  }, [])

  const getViewportSize = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return { width: 0, height: 0 }
    return viewport.getBoundingClientRect()
  }, [])

  const focusNearby = useCallback(() => {
    if (!myCell) return
    const { width, height } = getViewportSize()
    if (!width || !height) return

    const bounds = nearbyBounds(myCell, NEARBY_RADIUS_CELLS)
    updateCamera(cameraToFitBounds(bounds, width, height, MIN_ZOOM, MAX_ZOOM))
  }, [getViewportSize, myCell, updateCamera])

  const focusAll = useCallback(() => {
    const cells = userBoxes.map((box) => ({
      x: box.world_x,
      y: box.world_y,
    }))
    if (myCell) cells.push(myCell)

    const bounds = boundsFromCells(cells, 2)
    if (!bounds) return

    const { width, height } = getViewportSize()
    if (!width || !height) return

    updateCamera(cameraToFitBounds(bounds, width, height, MIN_ZOOM, MAX_ZOOM))
  }, [getViewportSize, myCell, updateCamera, userBoxes])

  useEffect(() => {
    if (!myCell || hasFocusedRef.current) return
    hasFocusedRef.current = true
    focusNearby()
  }, [focusNearby, myCell])

  const renderGrid = useCallback(() => {
    const viewport = viewportRef.current
    const canvas = gridCanvasRef.current
    if (!viewport || !canvas) return

    const dpr = window.devicePixelRatio || 1
    const { width, height } = viewport.getBoundingClientRect()

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawGrid(ctx, width, height, cameraRef.current)
  }, [])

  useEffect(() => {
    renderGrid()
  }, [camera, renderGrid])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new ResizeObserver(renderGrid)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [renderGrid])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        spaceHeldRef.current = true
        setSpaceHeld(true)
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
        if (isPanningRef.current) {
          isPanningRef.current = false
          setIsPanning(false)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, newZoom: number) => {
      const viewport = viewportRef.current
      if (!viewport) return

      const rect = viewport.getBoundingClientRect()
      const pointX = clientX - rect.left
      const pointY = clientY - rect.top
      const { x, y, zoom } = cameraRef.current

      const worldX = (pointX - x) / zoom
      const worldY = (pointY - y) / zoom
      const clampedZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM)

      updateCamera({
        x: pointX - worldX * clampedZoom,
        y: pointY - worldY * clampedZoom,
        zoom: clampedZoom,
      })
    },
    [updateCamera],
  )

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01)
        zoomAtPoint(e.clientX, e.clientY, cameraRef.current.zoom * factor)
        return
      }

      updateCamera({
        ...cameraRef.current,
        x: cameraRef.current.x - e.deltaX,
        y: cameraRef.current.y - e.deltaY,
      })
    },
    [updateCamera, zoomAtPoint],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const screenToWorld = useCallback((clientX: number, clientY: number): WorldPoint => {
    const viewport = viewportRef.current
    if (!viewport) return { x: 0, y: 0 }

    const rect = viewport.getBoundingClientRect()
    const { x, y, zoom } = cameraRef.current
    const screenX = clientX - rect.left
    const screenY = clientY - rect.top

    return {
      x: (screenX - x) / zoom,
      y: (screenY - y) / zoom,
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canPan =
        e.button === 1 || (e.button === 0 && spaceHeldRef.current)

      if (canPan) {
        e.preventDefault()
        isPanningRef.current = true
        setIsPanning(true)
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: cameraRef.current.x,
          panY: cameraRef.current.y,
        }
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        return
      }

      if (e.button === 0 && user && geoStatus !== 'active') {
        const world = screenToWorld(e.clientX, e.clientY)
        shareFromWorldPoint(world)
      }
    },
    [geoStatus, screenToWorld, shareFromWorldPoint, user],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return

    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y

    updateCamera({
      ...cameraRef.current,
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    })
  }, [updateCamera])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    setIsPanning(false)
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
  }, [])

  const zoomPercent = Math.round(camera.zoom * 100)
  const cursorClass = isPanning
    ? 'grabbing'
    : spaceHeld
      ? 'grab'
      : 'default'

  const myLatLng = myCell ? worldToLatLng(myCell) : null
  const nearbyCount = myCell
    ? userBoxes.filter((box) => {
        const dx = Math.abs(box.world_x - myCell.x) / GRID_SIZE
        const dy = Math.abs(box.world_y - myCell.y) / GRID_SIZE
        return dx <= NEARBY_RADIUS_CELLS && dy <= NEARBY_RADIUS_CELLS
      }).length
    : 0

  return (
    <div className="infinite-canvas-app">
      <div
        ref={viewportRef}
        className={`viewport viewport--${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={gridCanvasRef} className="grid-canvas" aria-hidden />

        <UserBoxes boxes={userBoxes} camera={camera} />

        <AuthPanel />

        {user && needsSetup && (
          <div className="setup-banner">
            <p className="setup-banner__title">Database setup required</p>
            <p className="setup-banner__copy">
              The <code>user_locations</code> table is missing. Open Supabase →
              SQL Editor, paste the contents of{' '}
              <code>supabase/setup.sql</code>, and click Run. Then refresh this
              page.
            </p>
            <button
              type="button"
              className="setup-banner__button"
              onClick={() => void retryConnection()}
            >
              Retry connection
            </button>
          </div>
        )}

        {user && syncError && !needsSetup && (
          <div className="setup-banner setup-banner--warning">
            <p className="setup-banner__copy">{syncError}</p>
          </div>
        )}

        {user && geoStatus === 'denied' && (
          <div className="setup-banner setup-banner--warning">
            <p className="setup-banner__copy">
              Location access denied — click a grid cell to place your box.
            </p>
          </div>
        )}

        <div className="hud">
          <div className="hud-panel">
            <span>{zoomPercent}%</span>
            {myLatLng && (
              <>
                <span className="hud-divider" />
                <span>
                  {myLatLng.lat.toFixed(2)}°, {myLatLng.lng.toFixed(2)}°
                </span>
              </>
            )}
            {user && (
              <>
                <span className="hud-divider" />
                <span>
                  {userBoxes.length} on grid · {nearbyCount} nearby
                </span>
              </>
            )}
          </div>
          <button type="button" className="hud-button" onClick={focusNearby}>
            Nearby
          </button>
          <button type="button" className="hud-button" onClick={focusAll}>
            Show all
          </button>
        </div>

        <div className="hint">
          Scroll to pan · Pinch or ⌘ scroll to zoom · Space + drag to pan
          {user && geoStatus === 'active' && ' · Your box follows GPS'}
          {user && geoStatus === 'denied' && ' · Click a cell to claim your box'}
        </div>
      </div>
    </div>
  )
}
