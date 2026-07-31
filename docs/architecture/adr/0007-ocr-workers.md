# ADR-0007 — OCR con Tesseract.js en worker threads

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
Es necesario extraer texto de imágenes (PNG/JPG/TIFF/BMP) y PDF escaneados, con detección de idioma y alta concurrencia sin bloquear la UI ni el proceso principal.

## Decisión
- **Tesseract.js** (WASM, sin binarios externos) ejecutado en **Worker Threads** (`node:worker_threads`), con un pool limitado (p. ej. 2–4 workers según CPU) y cola FIFO por lotes.
- La interfaz `OCREngine` (puerto en domain) expone `recognize(input): Promise<OCRResult>` con `text`, `confidence`, `language` y `pages`.
- **Detección de idioma**: heurística en dos pasos — candidatos rápidos (es/en) según contenido de bytes, y recalificación si la confianza es baja.
- **Reintentos**: política backoff exponencial para errores transitorios (carga de WASM/langdata).
- **Cache de resultados** por `sha256(pixels/metadata)` para no re-OCRear el mismo archivo.
- Se guarda la **confianza** del OCR en la base (permite priorizar archivos de baja calidad).

## Consecuencias
- El renderer nunca espera OCR síncrono; recibe progreso por eventos.
- El número de workers se configura y respeta los límites de RAM (langdata + buffer por worker).
- Tesseract.langdata puede ser grande; se usa `langPath` local al instalarse (sin descargas en runtime por defecto).
