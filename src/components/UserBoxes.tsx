import { useMemo, type CSSProperties } from 'react'
import { GRID_SIZE, MIN_CELL_SCREEN_PX, colorFromId, pickVisibleBoxesPerCell } from '../lib/grid'
import type { UserBox } from '../types/database'
import './UserBoxes.css'

type Camera = { x: number; y: number; zoom: number }

type UserBoxesProps = {
  boxes: UserBox[]
  camera: Camera
  onBoxClick: (box: UserBox) => void
}

export default function UserBoxes({ boxes, camera, onBoxClick }: UserBoxesProps) {
  const visibleBoxes = useMemo(() => pickVisibleBoxesPerCell(boxes), [boxes])

  if (visibleBoxes.length === 0) return null

  return (
    <div className="user-boxes">
      {visibleBoxes.map((box) => {
        const color = colorFromId(box.user_id)
        const sx = camera.x + box.world_x * camera.zoom
        const sy = camera.y + box.world_y * camera.zoom
        const size = Math.max(MIN_CELL_SCREEN_PX, GRID_SIZE * camera.zoom)
        const isGhost = !box.is_active
        const initial = box.display_name.charAt(0).toUpperCase()
        const showLabel = size >= 36

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
                width: size,
                height: size,
                '--box-color': color,
                '--box-size': `${size}px`,
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
