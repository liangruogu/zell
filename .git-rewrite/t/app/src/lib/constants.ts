export const APP_NAME = 'Bindle'
export const APP_VERSION = '0.1.0'

export const LINK_TYPE_LABELS: Record<string, string> = {
  web: '网页',
  github: 'GitHub',
  figma: 'Figma',
  canva: 'Canva',
  notion: 'Notion',
  other: '其他',
}

export const FILE_TYPE_LABELS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  pptx: 'PPT',
  txt: '文本',
  md: 'Markdown',
  image: '图片',
  other: '其他',
}

export const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'PPTX',
  txt: 'TXT',
  md: 'MD',
  image: 'IMG',
  other: 'OTHER',
}

export const INVITE_ROLES = [
  { value: 'editor', label: '编辑者' },
  { value: 'viewer', label: '查看者' },
] as const
