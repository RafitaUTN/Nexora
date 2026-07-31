# Guía para contribuir

## Flujo

1. Crea una rama desde `main`: `feat/nombre`, `fix/nombre`.
2. Commit con Conventional Commits (validado por commitlint + husky).
3. Asegura `lint`, `typecheck` y `test` en verde (también en el hook pre-push).
4. Abre un PR contra `main`; el CI ejecuta los mismos checks en Linux/Windows/macOS + cobertura (v8) + CodeQL + `npm audit`.
5. Pide revisión; describe el cambio y adjunta evidencia (capturas si es UI).

## Reglas de código

- Sigue los patrones de la arquitectura: **nunca** importes infraestructura desde `packages/domain`.
- Agrega/actualiza el **ADR** si tu cambio introduce una decisión de arquitectura.
- Actualiza el **roadmap** si cambias el alcance de una fase.
- Los nuevos módulos/componentes requieren tests con la misma cobertura (≥ 90% en domain/core).

## Revisión

- Revisores: autor del cambio + al menos un maintainer.
- El PR debe pasar: CI verde, sin secretos (se audita con el script `npm run audit:code`; también reporta deuda TODO/FIXME/HACK) y sin deuda nueva.
