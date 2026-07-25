
## Alcance

Módulo To-Do de nivel profesional (inspirado en Todoist / Things 3) totalmente integrado con actividades, objetivos, calendario y donuts. Las tareas pasan a ser una entidad de primer nivel con duración estimada, y pueden pintar los círculos por sí solas.

## Cambios en el modelo (`src/lib/time-store.ts`)

Extender `Task`:
- `activityId?: string` — vínculo opcional (una tarea puede no pertenecer a ninguna actividad).
- `goalIds?: string[]` — objetivo(s) asociado(s).
- `category?: Category`.
- `startTime?: string`, `dueTime` ya existe (hora límite), añadir `estimatedMinutes: number` (obligatoria).
- `tags?: string[]`.
- `archived?: boolean`, `deletedAt?: number` (papelera).
- `color?: string` heredado de la actividad si existe.

Store:
- Nuevo array top-level `tasks: Task[]` (fuente única). Migración: aplanar `activities[].tasks` a `store.tasks` con `activityId`, manteniendo backward-compat.
- `chartView: "activities" | "goals" | "tasks" | "combined"`.
- Selectores: `tasksToday`, `tasksUpcoming`, `tasksOverdue`, `tasksCompleted`, `tasksUnassigned`, `tasksByPriority`, `tasksByGoal`, `taskStreaks`.

## Nuevo módulo: pestaña "To-Do"

`src/routes/todo.tsx` (nueva ruta `/todo`) con navegación en el header (chips: Semana · Día · To-Do).

Componentes nuevos en `src/components/todo/`:
- `TodoSidebar.tsx` — vistas: Hoy, Próximas, Atrasadas, Completadas, Sin actividad, Por prioridad, Por objetivo, Etiquetas, Archivadas, Papelera. Contadores en vivo.
- `TaskListView.tsx` — lista densa tipo Things: checkbox, título, chips (actividad, objetivo, prioridad, duración, fecha). Selección múltiple, arrastrar entre días, drag & drop para reordenar.
- `TaskComposer.tsx` — creación rápida (Cmd+K/inline) con parsing ligero: `#actividad`, `@objetivo`, `!alta`, `~2h`, `mañana 15:00`.
- `TaskEditor.tsx` — Sheet lateral con todos los campos (nombre, descripción, actividad, objetivo, categoría, prioridad, fecha, hora inicio/límite, duración, estado, etiquetas, notas).
- `TodoStats.tsx` — panel superior: creadas, completadas, %, horas planificadas vs realizadas, pendientes, racha diaria/semanal, productividad hoy.
- `TodoFilters.tsx` — búsqueda instantánea, orden (duración/prioridad/fecha/nombre), filtros combinables.
- `TaskTrash.tsx` — restaurar / vaciar.

## Integración con los círculos (`DonutChart` + `src/routes/index.tsx` + `DayView`)

Cuatro modos en el toggle del donut:
1. **Actividades** (actual).
2. **Objetivos** (actual).
3. **Tareas** — sintetiza segmentos desde `store.tasks` usando `estimatedMinutes`. Color = color de tarea → actividad → objetivo → categoría. Semana: suma minutos de tareas cuya fecha cae en la semana actual (o sin fecha si el usuario lo elige). Día: suma minutos de tareas del día seleccionado.
4. **Combinado** — anillo exterior = actividades; anillo interior = tareas dentro de cada actividad (mismo ángulo, subdividido proporcionalmente por duración). Tareas sin actividad forman un sector externo "Independientes". Implementado con dos `<path>` concéntricos en `DonutChart`.

Sincronización: todo consume `useTimeStore` → cualquier CRUD de tarea recalcula donuts, planner diario, `WeekGrid` (marcadores por día), objetivos y stats de actividad automáticamente vía `useMemo`.

## Integración con actividades existentes

- La sección "Tareas" dentro de `ActivityForm` sigue funcionando, pero ahora escribe/lee de `store.tasks` filtrando por `activityId`.
- Cada tarjeta de actividad muestra `n tareas · m completadas · %` derivado de `store.tasks`.
- Al eliminar una actividad, sus tareas quedan como "Sin actividad" (no se borran).
- Al eliminar un objetivo, se limpia `goalIds` de las tareas.

## Calendario (`WeekGrid`, `DayPlanner`, `DayView`)

- Tareas con `dueDate` aparecen como puntos/bloques en su día.
- Drag & drop entre días cambia `dueDate` (HTML5 DnD).
- Tareas sin fecha nunca aparecen en el calendario.

## Validaciones

Zod schema centralizado en `src/lib/task-schema.ts`:
- `estimatedMinutes >= 1`.
- Fechas ISO válidas; `dueTime >= startTime` si ambas.
- `activityId` y `goalIds` deben existir (si no, se limpian en migración).
- Rechazar duplicados con mismo `id`.

## Racha / productividad

Helpers puros en `src/lib/task-stats.ts`: `dailyStreak`, `weeklyStreak`, `productivityScore(day)` = completadas/planificadas por minutos, con ventana móvil.

## Detalles técnicos

- Fuente única: `store.tasks`. Eliminar `activity.tasks` (con migración one-shot).
- Papelera: soft-delete con `deletedAt`; auto-purga tras 30 días al hidratar.
- Arquitectura preparada para: subtareas (`parentId`), recurrencia (`rrule?: string`), recordatorios (`remindAt?: number`), adjuntos (`attachments?: []`), comentarios (`comments?: []`). Campos opcionales presentes desde ya, sin UI.
- Animaciones: `animate-fade-in`, `animate-scale-in`, transiciones en checkboxes y reordenamiento.
- Mobile-first: sidebar colapsable en `< md`, sheets a pantalla completa.

## Archivos nuevos

```
src/routes/todo.tsx
src/components/todo/TodoSidebar.tsx
src/components/todo/TaskListView.tsx
src/components/todo/TaskComposer.tsx
src/components/todo/TaskEditor.tsx
src/components/todo/TodoStats.tsx
src/components/todo/TodoFilters.tsx
src/components/todo/TaskTrash.tsx
src/lib/task-schema.ts
src/lib/task-stats.ts
```

## Archivos modificados

```
src/lib/time-store.ts        (modelo + migración + selectores)
src/components/time/DonutChart.tsx   (modo combinado con doble anillo)
src/routes/index.tsx         (toggle 4 modos + link a /todo)
src/routes/__root.tsx        (nav global)
src/components/time/ActivityForm.tsx (TaskList lee de store.tasks)
src/components/time/TaskList.tsx     (usa store centralizado)
src/components/time/WeekGrid.tsx     (marcadores de tareas)
src/components/time/DayPlanner.tsx / DayView.tsx  (sincronía)
```

Confirmá y arranco. Es un módulo grande: preferís que lo entregue completo en una sola pasada o por fases (modelo+ruta → integración círculos → panels avanzados)?
