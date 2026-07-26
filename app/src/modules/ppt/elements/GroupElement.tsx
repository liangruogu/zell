import { useDrag, type EP } from './utils'
import { ReadOnlyEl } from './ReadOnlyElement'

export function GroupEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const children = el.groupChildren || []
  return (
    <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, cursor: dragging ? 'grabbing' : 'default' }} onMouseDown={onMouseDown}>
      {children.map(child => (
        <ReadOnlyEl key={child.id} el={child} isSelected={false} />
      ))}
    </div>
  )
}
