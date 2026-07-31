# ADR-0008 — Actualizaciones con electron-updater (firmado y con rollback)

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
Se requiere actualización automática de instaladores, verificación de integridad/firma, rollback y publicación vía GitHub Releases desde CI.

## Evaluación de alternativas
| Opción | Veredicto |
|---|---|
| **electron-updater** (parte de electron-builder) | **Elegido.** Diferencial NSIS (solo bytes cambiados), verificación SHA-256, soporta canales (beta/stable), rollback conservando el instalador anterior. Probado y mantenido por el mismo ecosistema de empaquetado. |
| Sparkle (macOS) | Windows/Linux no lo cubre. |
| Updates de GitHub por polling propio + zip reemplazable | Reinventar la rueda; sin firma ni diferencial. |
| Tauri updater | No aplica (runtime Electron). |

## Diseño
1. **CI (GitHub Actions)** publica en GitHub Releases: `latest.yml` (macOS), `latest-linux.yml`, `latest.yml` (Windows) + artefactos `.exe`/NSIS diferenciales + **checksum y firma**.
2. **La app** consulta el feed de actualización en un intervalo configurable (p. ej. cada 4 h) y en cada arranque.
3. **Verificación**: electron-updater valida el hash SHA-256 del artefacto descargado y que la firma digital (Authenticode en Windows) coincida con el certificado publicado. Si falla → **se descarta** y se registra en auditoría; nunca se instala un paquete no verificado.
4. **Rollback**: electron-builder conserva la versión anterior instalada; si la nueva falla al arrancar (guardia: flag `firstRun` + health-check), la app restaura la anterior automáticamente.
5. Changelog: se muestra el del Release actual (obtenido de GitHub Releases).

## Consecuencias
- Se requiere certificado de firma (Windows EV o estándar; macOS notarización). Sin certificado, el canal firma se desactiva y la app **bloquea la instalación de actualizaciones sin firma válida** en builds de producción (config por entorno).
- El artefacto firmado es requisito para el canal estable; el canal de desarrollo usa código sin firmar pero nunca se auto-instala.
