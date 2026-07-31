import ExcelJS from 'exceljs'
import type { ExtractedDocument } from '../types'

/**
 * Excel .xlsx: extrae el texto de todas las hojas (celdas + encabezados de
 * filas/columnas), útil para indexado y búsqueda.
 */
export async function extractXlsx(buffer: Uint8Array): Promise<ExtractedDocument> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer)

  const parts: string[] = []
  let sheetCount = 0

  for (const sheet of workbook.worksheets) {
    sheetCount += 1
    const rows: string[] = []
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)
      const cells = (row.values as unknown[])
        .slice(1)
        .filter((v): v is unknown => v !== undefined && v !== null)
        .map((v) => {
          if (v instanceof Date) return v.toISOString()
          if (typeof v === 'object' && 'result' in (v as Record<string, unknown>)) {
            return String((v as { result: unknown }).result)
          }
          return String(v)
        })
        .filter((v) => v.length > 0)
      if (cells.length > 0) rows.push(cells.join(' | '))
    }
    if (rows.length > 0) parts.push(`[Hoja: ${sheet.name}]\n${rows.join('\n')}`)
  }

  return {
    text: parts.join('\n\n'),
    metadata: { sheets: sheetCount },
  }
}
