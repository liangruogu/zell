import type { EP } from './utils'
import { ReadOnlyImageEl } from './ImageElement'
import { ReadOnlyTextEl } from './TextElement'
import { ReadOnlyRectEl } from './RectElement'
import { ReadOnlyEllipseEl } from './EllipseElement'
import { ReadOnlyArrowEl } from './ArrowElement'

export function ReadOnlyEl({ el }: EP) {
  switch (el.type) {
    case 'image': return <ReadOnlyImageEl el={el} isSelected={false} />
    case 'text': return <ReadOnlyTextEl el={el} isSelected={false} />
    case 'ellipse': return <ReadOnlyEllipseEl el={el} isSelected={false} />
    case 'arrow': return <ReadOnlyArrowEl el={el} isSelected={false} />
    default: return <ReadOnlyRectEl el={el} isSelected={false} />
  }
}
