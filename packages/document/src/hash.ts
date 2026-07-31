import { createHash } from 'node:crypto'

/**
 * SHA-256 en streaming sobre un buffer (buffers enteros, suficientes para
 * documentos de oficina). Para archivos enormes se usaría ReadableStream.
 */
export async function sha256(data: Uint8Array): Promise<string> {
  return createHash('sha256').update(data).digest('hex')
}
