export { snapPos, SNAP } from './elements/utils'

import type { CanvasElement as CE } from './types'
import type { EP } from './elements/utils'
import { ImageEl } from './elements/ImageElement'
import { TextEl } from './elements/TextElement'
import { EllipseEl } from './elements/EllipseElement'
import { ArrowEl } from './elements/ArrowElement'
import { RectEl } from './elements/RectElement'
import { GroupEl } from './elements/GroupElement'
import { ReadOnlyEl } from './elements/ReadOnlyElement'

export function CanvasElementView({ element, isSelected, readOnly }: { element: CE; isSelected: boolean; readOnly?: boolean }) {
  if (readOnly) {
    return <ReadOnlyEl el={element} isSelected={isSelected} />
  }
  const p: EP = { el: element, isSelected }
  if (element.type === 'group' && element.groupChildren) {
    return <GroupEl el={element} isSelected={isSelected} />
  }
  switch (element.type) {
    case 'image': return <ImageEl {...p} />
    case 'text': return <TextEl {...p} />
    case 'ellipse': return <EllipseEl {...p} />
    case 'arrow': return <ArrowEl {...p} />
    default: return <RectEl {...p} />
  }
}
