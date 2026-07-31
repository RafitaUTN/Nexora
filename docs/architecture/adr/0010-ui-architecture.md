# ADR-0010 — Arquitectura de UI feature-based con design system propio

**Estado:** Aceptado · **Fecha:** 2026-07-31

## Contexto
La UI debe ser moderna (referencias: Notion, Linear, Raycast, Arc, Obsidian, VS Code), responsive, con dark/light mode, accesible, y mantenible en un equipo.

## Decisión
- **React + TypeScript + Vite** en el renderer.
- **Feature-based folders**: `src/renderer/src/features/<feature>/` (components, hooks, api, stores) + `src/renderer/src/app/` (routing, layout, providers). Regla: ningún componente > 300 líneas.
- **Design tokens** (CSS variables) para color/espacio/tipografía con tema claro y oscuro → **TailwindCSS** con configuración de tokens.
- **shadcn/ui** (Radix UI + Tailwind + `cva`) como base de componentes accesibles; extendido con componentes propios (DataTable virtualizado con TanStack Virtual).
- **Zustand** para estado global de UI (tema, paneles, command palette); **TanStack Query** para data fetching vía IPC; **React Router** para rutas; **React Hook Form + Zod** para formularios; **Framer Motion** para microinteracciones (sutil, `prefers-reduced-motion` respetado).
- **Command Palette** con `cmdk`; atajos de teclado centralizados.
- **Accesibilidad**: foco visible, roles ARIA en componentes Radix, contraste AA+, navegación por teclado.

## Consecuencias
- El renderer no importa paquetes de `node:` ni lógica de dominio; solo consume la API tipada del preload.
- Los componentes de UI son headless (Radix) + estilos propios, evitando dependencias de componentes gigantes.
- El tema se persiste en Zustand + `localStorage` y se sincroniza con `nativeTheme` de Electron.
