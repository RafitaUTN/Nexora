export const APP_NAME = 'DocuMind'
export const APP_VERSION = '1.1.0'

export const SUPPORTED_TEXT_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'txt',
  'md',
  'csv',
  'rtf',
] as const

export const SUPPORTED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp'] as const

export const SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_TEXT_EXTENSIONS,
  ...SUPPORTED_IMAGE_EXTENSIONS,
] as const

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number]

export const MAX_CONTENT_FOR_AI = 32_000
export const OCR_MAX_DPI = 300
export const DEFAULT_AI_TOKEN_BUDGET = 8_000
export const DEFAULT_OCR_LANGUAGES = ['spa', 'eng']
export const DEFAULT_BATCH_SIZE = 200
export const HASH_CHUNK_SIZE = 1024 * 1024
