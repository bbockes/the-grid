import { useMemo, type CSSProperties } from 'react'
import {
  displayCellSizeForZoom,
  displayPosition,
  MIN_CELL_SCREEN_PX,
  colorFromId,
  pickVisibleBoxesPerCell,
} from '../lib/grid'
import type { UserBox } from '../types/database'
import './UserBoxes.css'

type Camera = { x: number; y: number; zoom: number }

type UserBoxesProps = {
  boxes: UserBox[]
  camera: Camera
  onBoxClick: (box: UserBox) => void
}

export default function UserBoxes({ boxes, camera, onBoxClick }: UserBoxesProps) {
  const cellSize = displayCellSizeForZoom(camera.zoom)

  const visibleBoxes = useMemo(
    () => pickVisibleBoxesPerCell(boxes, () => cellSize),
    [boxes, cellSize],
  )

  if (visibleBoxes.length === 0) return null

  return (
    <div className="user-boxes">
      {visibleBoxes.map((box) => {
        const color = colorFromId(box.user_id)
        const display = displayPosition(
          { x: box.world_x, y: box.world_y },
          cellSize,
        )
        const boxScreenSize = Math.max(MIN_CELL_SCREEN_PX, cellSize * camera.zoom)
        const sx = camera.x + display.x * camera.zoom
        const sy = camera.y + display.y * camera.zoom
        const isGhost = !box.is_active
        const initial = box.display_name.charAt(0).toUpperCase()
        const showLabel = boxScreenSize >= 36

        return (
          <button
            key={box.user_id}
            type="button"
            className={[
              'user-box',
              box.isSelf && 'user-box--self',
              isGhost && 'user-box--ghost',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              {
                transform: `translate(${sx}px, ${sy}px)`,
                width: boxScreenSize,
                height: boxScreenSize,
                '--box-color': color,
                '--box-size': `${boxScreenSize}px`,
              } as CSSProperties
            }
            aria-label={`View ${box.display_name}'s profile`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onBoxClick(box)
            }}
          >
            {box.avatar_url ? (
              <img
                className="user-box__photo"
                src={box.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="user-box__initial">{initial}</span>
            )}

            {showLabel && (
              <span className="user-box__label">
                {box.display_name}
                {isGhost && ' (away)'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
