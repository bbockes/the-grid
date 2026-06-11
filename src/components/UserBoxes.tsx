import type { CSSProperties } from 'react'
import { GRID_SIZE, MIN_CELL_SCREEN_PX, colorFromId } from '../lib/grid'
import type { UserBox } from '../types/database'
import './UserBoxes.css'

type Camera = { x: number; y: number; zoom: number }

type UserBoxesProps = {
  boxes: UserBox[]
  camera: Camera
}

export default function UserBoxes({ boxes, camera }: UserBoxesProps) {
  if (boxes.length === 0) return null

  return (
    <div className="user-boxes">
      {boxes.map((box) => {
        const color = colorFromId(box.user_id)
        const sx = camera.x + box.world_x * camera.zoom
        const sy = camera.y + box.world_y * camera.zoom
        const size = Math.max(MIN_CELL_SCREEN_PX, GRID_SIZE * camera.zoom)

        return (
          <div
            key={box.user_id}
            className={`user-box${box.isSelf ? ' user-box--self' : ''}`}
            style={
              {
                transform: `translate(${sx}px, ${sy}px)`,
                width: size,
                height: size,
                '--box-color': color,
              } as CSSProperties
            }
          >
            <span className="user-box__label">{box.display_name}</span>
          </div>
        )
      })}
    </div>
  )
}
