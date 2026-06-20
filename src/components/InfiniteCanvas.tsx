import { useCallback, useEffect, useRef, useState } from 'react'
import AuthPanel from './AuthPanel'
import MessengerPanel from './MessengerPanel'
import UserBoxes from './UserBoxes'
import UserProfileModal from './UserProfileModal'
import { useAuth } from '../context/AuthContext'
import { useLocationSharing } from '../hooks/useLocationSharing'
import { useMessaging } from '../hooks/useMessaging'
import {
  boundsFromPoints,
  cameraToFitBounds,
  cellCenter,
  displayCellSizeForZoom,
  gridLineCellSize,
  MAX_ZOOM,
  MIN_ZOOM,
  nearbyBounds,
  snapToCellSize,
  worldToLatLng,
  type WorldPoint,
} from '../lib/grid'
import './InfiniteCanvas.css'

const NEARBY_RADIUS_CELLS = 4
const SCROLL_PAN_SPEED = 2

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
  const cellSize = gridLineCellSize(zoom)
  const gridScreen = cellSize * zoom

  ctx.clearRect(0, 0, width, height)

  const worldLeft = -panX / zoom
  const worldTop = -panY / zoom
  const worldRight = worldLeft + width / zoom
  const worldBottom = worldTop + height / zoom

  const firstX = Math.floor(worldLeft / cellSize) * cellSize
  const firstY = Math.floor(worldTop / cellSize) * cellSize

  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'

  for (let wx = firstX; wx <= worldRight; wx += cellSize) {
    const sx = panX + wx * zoom
    const pixelX = Math.round(sx) + 0.5
    ctx.beginPath()
    ctx.moveTo(pixelX, 0)
    ctx.lineTo(pixelX, height)
    ctx.stroke()
  }

  for (let wy = firstY; wy <= worldBottom; wy += cellSize) {
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
    const majorStep = cellSize * majorEvery
    const majorFirstX = Math.floor(firstX / majorStep) * majorStep
    const majorFirstY = Math.floor(firstY / majorStep) * majorStep

    for (let wx = majorFirstX; wx <= worldRight; wx += majorStep) {
      const sx = panX + wx * zoom
      const pixelX = Math.round(sx) + 0.5
      ctx.beginPath()
      ctx.moveTo(pixelX, 0)
      ctx.lineTo(pixelX, height)
      ctx.stroke()
    }

    for (let wy = majorFirstY; wy <= worldBottom; wy += majorStep) {
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
    setupHint,
    userBoxes,
    myCell,
    geoStatus,
    shareFromWorldPoint,
    retryConnection,
  } = useLocationSharing(user?.id)

  const messaging = useMessaging(user?.id)

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
  const [viewedUserId, setViewedUserId] = useState<string | null>(null)

  const viewedProfile = viewedUserId
    ? (userBoxes.find((box) => box.user_id === viewedUserId) ?? null)
    : null

  useEffect(() => {
    if (viewedUserId && !userBoxes.some((box) => box.user_id === viewedUserId)) {
      setViewedUserId(null)
    }
  }, [userBoxes, viewedUserId])

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

    const cellSize = displayCellSizeForZoom(cameraRef.current.zoom)
    const bounds = nearbyBounds(myCell, NEARBY_RADIUS_CELLS, cellSize)
    updateCamera(cameraToFitBounds(bounds, width, height, MIN_ZOOM, MAX_ZOOM))
  }, [getViewportSize, myCell, updateCamera])

  const focusAll = useCallback(() => {
    const points = userBoxes.map((box) => ({
      x: box.world_x,
      y: box.world_y,
    }))
    if (myCell) points.push(myCell)

    const bounds = boundsFromPoints(points)
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
        const target = e.target
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest('input, textarea, select, [contenteditable="true"]'))
        ) {
          return
        }

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
      const target = e.target
      if (
        target instanceof Element &&
        target.closest(
          '.edit-profile-overlay, .user-profile-overlay, .auth-panel',
        )
      ) {
        return
      }

      e.preventDefault()

      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01)
        zoomAtPoint(e.clientX, e.clientY, cameraRef.current.zoom * factor)
        return
      }

      updateCamera({
        ...cameraRef.current,
        x: cameraRef.current.x - e.deltaX * SCROLL_PAN_SPEED,
        y: cameraRef.current.y - e.deltaY * SCROLL_PAN_SPEED,
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
        const cellSize = displayCellSizeForZoom(cameraRef.current.zoom)
        const corner = snapToCellSize(world.x, world.y, cellSize)
        shareFromWorldPoint(cellCenter(corner, cellSize))
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
  const activeBoxes = userBoxes.filter((box) => box.is_active)
  const ghostBoxes = userBoxes.filter((box) => !box.is_active)
  const activeCount =
    activeBoxes.filter((box) => !box.isSelf).length + (user ? 1 : 0)

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

        <UserBoxes
          boxes={userBoxes}
          camera={camera}
          onBoxClick={(box) => setViewedUserId(box.user_id)}
        />

        {viewedProfile && (
          <UserProfileModal
            box={viewedProfile}
            onClose={() => setViewedUserId(null)}
            onMessage={(userId) => {
              setViewedUserId(null)
              void messaging.startConversationWith(userId)
            }}
          />
        )}

        {user && (
          <>
            <MessengerPanel
              open={messaging.panelOpen}
              view={messaging.view}
              conversations={messaging.conversations}
              activeConversation={messaging.activeConversation}
              messages={messaging.messages}
              currentUserId={user.id}
              loading={messaging.loading}
              sending={messaging.sending}
              error={messaging.error}
              onClose={messaging.closePanel}
              onBack={messaging.backToList}
              onSelectConversation={(conversationId) => {
                void messaging.openConversation(conversationId)
              }}
              onSendMessage={messaging.sendMessage}
            />

            {!messaging.panelOpen && (
              <button
                type="button"
                className="messenger-fab"
                aria-label="Open messages"
                onClick={messaging.openPanel}
              >
                <svg
                  className="messenger-fab__icon"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    fill="currentColor"
                    d="M12 3C7.03 3 3 6.58 3 11c0 2.01.9 3.86 2.41 5.29L4 21l4.96-1.18A9.8 9.8 0 0 0 12 19c4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
                  />
                </svg>
              </button>
            )}
          </>
        )}

        <AuthPanel />

        {user && needsSetup && setupHint && (
          <div className="setup-banner">
            <p className="setup-banner__title">Database setup required</p>
            <p className="setup-banner__copy">{setupHint}</p>
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
                  {activeCount} active
                  {ghostBoxes.length > 0 && ` · ${ghostBoxes.length} away`}
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

        {!(user && messaging.panelOpen) && (
          <div
            className={[
              'hint',
              user && !messaging.panelOpen && 'hint--with-messenger',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Scroll to pan · Pinch or ⌘ scroll to zoom · Space + drag to pan
            {user && geoStatus === 'active' && ' · Your box follows GPS'}
            {user && geoStatus === 'denied' &&
              ' · Click a cell to claim your box'}
            {user && ' · Zoom in to see nearby users'}
          </div>
        )}
      </div>
    </div>
  )
}
