import { describe, expect, it } from 'vitest'
import {
  clamp,
  escapeRegExp,
  extensionOf,
  formatBytes,
  isAllowedExtension,
  slugify,
  truncate,
} from './utils'

describe('utils', () => {
  it('extensionOf devuelve la extensión en minúsculas', () => {
    expect(extensionOf('informe.PDF')).toBe('pdf')
    expect(extensionOf('sin-extension')).toBe('')
  })

  it('isAllowedExtension acepta extensiones soportadas', () => {
    expect(isAllowedExtension('factura.pdf')).toBe(true)
    expect(isAllowedExtension('foto.jpg')).toBe(true)
    expect(isAllowedExtension('malware.exe')).toBe(false)
  })

  it('formatBytes usa las unidades correctas', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('slugify normaliza y limpia el texto', () => {
    expect(slugify('Área de Facturación')).toBe('area-de-facturacion')
    expect(slugify('  Hola   Mundo!!  ')).toBe('hola-mundo')
  })

  it('clamp acota el valor', () => {
    expect(clamp(10, 0, 5)).toBe(5)
    expect(clamp(-2, 0, 5)).toBe(0)
    expect(clamp(3, 0, 5)).toBe(3)
  })

  it('truncate recorta sin exceder el límite', () => {
    expect(truncate('abc', 2)).toBe('ab')
    expect(truncate('abc', 5)).toBe('abc')
  })

  it('escapeRegExp escapa metacaracteres', () => {
    expect(escapeRegExp('a.b(c)')).toBe('a\\.b\\(c\\)')
  })
})
