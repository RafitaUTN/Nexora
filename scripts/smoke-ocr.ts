import { createCanvas } from '@napi-rs/canvas'
import { TesseractOcrEngine } from '@documind/ocr'

async function main(): Promise<void> {
  const canvas = createCanvas(640, 160)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 640, 160)
  ctx.fillStyle = '#000000'
  ctx.font = '48px sans-serif'
  ctx.fillText('DocuMind OCR 2026', 30, 90)

  const png = new Uint8Array(canvas.toBuffer('image/png'))
  const engine = new TesseractOcrEngine({ maxWorkers: 1, defaultLanguages: ['eng'] })
  const health = await engine.health()
  console.log('health', health)
  const result = await engine.recognize({ buffer: png, mimeType: 'image/png' }, ['eng'])
  console.log('text=%o conf=%s version=%s', result.text.trim(), result.confidence.toFixed(2), result.engineVersion)
  if (!result.text.includes('DocuMind')) throw new Error('OCR no reconoció el texto')
  console.log('OCR SMOKE OK')
  await engine.dispose()
}

main().catch((err) => {
  console.error('OCR SMOKE FAIL', err)
  process.exit(1)
})
