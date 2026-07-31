import { ExtractionService, detectMime } from '@documind/document'
import { createAIProvider } from '@documind/ai'
import { defaultModels } from '@documind/domain'
import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun } from 'docx'

const svc = new ExtractionService()

async function main(): Promise<void> {
  // 1. Texto plano
  const txt = new TextEncoder().encode('Hola DocuMind, factura #123 de prueba.\nLínea dos.')
  const r1 = await svc.extract(txt, 'prueba.txt')
  console.log('TXT mime=%s hash=%s text=%o', r1.metadata.mimeType, r1.metadata.hash?.slice(0, 12), r1.text.trim().slice(0, 60))
  if (!r1.metadata.mimeType?.includes('text/plain')) throw new Error('MIME txt incorrecto')

  // 2. PDF real vía pdfjs (generamos uno con pdfkit)
  const PDFDocument = (await import('pdfkit')).default
  const pdf = new PDFDocument()
  const chunks: Buffer[] = []
  pdf.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>((resolve) => {
    pdf.on('end', resolve)
    pdf.fontSize(12).text('Documento PDF de prueba con texto indexable.')
    pdf.end()
  })
  const pdfBuf = new Uint8Array(Buffer.concat(chunks))
  const r2 = await svc.extract(pdfBuf, 'prueba.pdf')
  console.log('PDF mime=%s pages=%s text=%o', r2.metadata.mimeType, r2.metadata.pages, r2.text.trim().slice(0, 60))
  if (!r2.text.includes('PDF de prueba')) throw new Error('Extracción de texto PDF falló')

  // 3. DOCX real con docx
  const docx = new Document({
    sections: [
      { children: [new Paragraph({ children: [new TextRun('Contenido Word de prueba')] })] },
    ],
  })
  const docxBuf = await Packer.toBuffer(docx)
  const r3 = await svc.extract(new Uint8Array(docxBuf), 'prueba.docx')
  console.log('DOCX mime=%s text=%o', r3.metadata.mimeType, r3.text.trim().slice(0, 60))
  if (!r3.text.includes('Contenido Word')) throw new Error('Extracción DOCX falló')

  // 4. XLSX real con exceljs
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Ventas')
  ws.addRow(['Cliente', 'Importe'])
  ws.addRow(['Acme S.A.', 1250])
  const xlsxBuf = await wb.xlsx.writeBuffer()
  const r4 = await svc.extract(new Uint8Array(xlsxBuf), 'ventas.xlsx')
  console.log('XLSX mime=%s sheets=%s text=%o', r4.metadata.mimeType, r4.metadata.sheets, r4.text.trim().slice(0, 80))
  if (!r4.text.includes('Acme')) throw new Error('Extracción XLSX falló')

  // 5. MIME por magic bytes
  const mime = detectMime(pdfBuf, 'otro.extension')
  if (mime !== 'application/pdf') throw new Error(`MIME por contenido falló: ${mime}`)
  console.log('MIME detectado por contenido: %s', mime)

  // 6. Factoría IA (sin llamada de red)
  const provider = createAIProvider('openrouter', 'sk-test')
  const model = defaultModels.openrouter
  console.log('Provider id=%s model=%s', provider.id, model)
  if (provider.id !== 'openrouter') throw new Error('Factoría falló')

  console.log('SMOKE OK')
}

main().catch((err) => {
  console.error('SMOKE FAIL', err)
  process.exit(1)
})
