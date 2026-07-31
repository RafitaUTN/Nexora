export interface DocumentMetadata {
  title?: string
  author?: string
  creationDate?: string
  pages?: number
  size?: number
  mimeType?: string
  [key: string]: unknown
}

export interface ExtractedDocument {
  text: string
  metadata: DocumentMetadata
  /** Páginas rasterizadas como PNG (para OCR de escaneos). */
  images?: Uint8Array[]
}

export type Extractor = (buffer: Uint8Array, filename: string) => Promise<ExtractedDocument>
