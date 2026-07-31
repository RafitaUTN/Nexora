# Convenciones

## Commits

`tipo(alcance): asunto` — tipos: `feat | fix | perf | refactor | docs | ci | build | chore | test | revert`.

## TypeScript

- `strict: true` en toda la base; `noUncheckedIndexedAccess`.
- Tipos inmutables con `readonly` en parámetros que no se mutan.
- Preferir `interface` para contratos/puertos y `type` para uniones.
- No `any`; usar `unknown` + narrowing, o `z.infer` desde schemas compartidos.

## Imports

- Orden: node → externos → workspace packages → internos.
- `import type` para importar solo tipos (mantiene el tree-shaking).
- Prohibido importar `packages/core|ai|ocr|document` desde `packages/domain` (ESLint).

## Componentes React

- Feature-based (`features/<feature>/{components,hooks,stores,api}`).
- Máximo 300 líneas por archivo de componente.
- Props tipadas con `type Props = {...}`; componentes puros salvo necesidad (hooks).
- Accesibilidad: Radix para comportamientos complejos, `aria-label` en iconos, foco visible.
- Animaciones con Framer Motion solo si aportan feedback real; respetar `prefers-reduced-motion`.

## Estilos

- Tailwind con tokens de design system (no colores mágicos fuera de tokens).
- Tema oscuro y claro vía variables CSS (`data-theme`).

## Pruebas

- `*.test.ts` junto al código. Naming: `describe('unidad') / it('hace algo')`.
- Fakes de puertos (nunca tocar disco/red en tests de domain).
