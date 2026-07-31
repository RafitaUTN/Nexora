# Guía de despliegue

## Empaquetado

```bash
npm run build:win     # NSIS + portable (Windows x64)
npm run build:mac     # dmg (requiere macOS)
npm run build:linux   # AppImage + deb (requiere Linux)
```

## Firma (requisito para el canal estable)

| Plataforma | Requisito | Secrets CI |
|---|---|---|
| Windows | Certificado Authenticode (EV recomendado) | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS | Apple Developer ID + notarización | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

## Publicación de un release

1. Commit convencional → PR → CI verde.
2. Etiquetar: `git tag v1.2.3 && git push origin v1.2.3`.
3. `release.yml` construye, firma y publica el Release + feed `latest*.yml`.
4. La app detecta la nueva versión y la instala solo si la firma/hash es válida.

## Canales

- `v1.2.3-beta.1` → canal beta (solo si el usuario se suscribe al canal beta).
- `v1.2.3` → canal estable.

## Sin certificado

- Los builds locales funcionan; la auto-instalación de actualizaciones se desactiva en producción y la app muestra el motivo.
- Se recomienda el canal `dev`/`alpha` con auto-update deshabilitado.
