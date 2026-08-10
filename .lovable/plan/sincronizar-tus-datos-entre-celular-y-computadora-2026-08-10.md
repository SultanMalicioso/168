# Sincronizar tus datos entre celular y computadora

Hoy todo (actividades, objetivos, tareas, temporizadores e historial) se guarda solo en el navegador del dispositivo que usaste. Por eso lo que cargás en el celular no aparece en la compu.

Para que sí se sincronice hace falta una cuenta y una base de datos en la nube: activás Lovable Cloud, iniciás sesión con el mismo email en ambos dispositivos y los datos viajan solos.

## Qué se va a construir

1. **Cuenta de usuario**
   - Pantalla de registro / inicio de sesión con email y contraseña.
   - Botón de cerrar sesión y aviso de "modo local" cuando no hay sesión.

2. **Guardado en la nube**
   - Tablas privadas por usuario para: actividades, objetivos, tareas, sesiones/temporizadores e historial diario.
   - Cada persona solo ve sus propios datos.

3. **Sincronización automática**
   - Al iniciar sesión se descargan tus datos y reemplazan la vista local.
   - Cada cambio (crear actividad, completar día, iniciar timer) se guarda en la nube al instante.
   - Al abrir la app en el otro dispositivo, se cargan los datos más recientes.

4. **Migración de lo que ya tenés**
   - La primera vez que inicies sesión, si el dispositivo tiene datos locales y la cuenta está vacía, se suben esos datos para no perder nada.

5. **Sin sesión, todo sigue funcionando**
   - Si no querés crear cuenta, la app sigue guardando en el dispositivo como hasta ahora.

## Detalles técnicos

- Habilitar Lovable Cloud (base de datos + auth por email).
- Tablas en `public` con `user_id`, RLS por `auth.uid()` y sus GRANTs correspondientes.
- Nueva capa `src/lib/sync/` que envuelve los stores actuales (`time-store`, `timer-store`, `history-store`) manteniendo su API: escritura local inmediata + push a la nube (debounce), y pull al montar / al recuperar foco.
- Estrategia de conflicto simple: gana el cambio más reciente (`updated_at`).
- Ruta `/auth` pública para login/registro; el resto de la app no se bloquea sin sesión.
- Indicador de estado de sincronización en el header (sincronizado / guardando / sin conexión).

## Fuera de alcance por ahora

- Login con Google/Apple (se puede agregar después).
- Edición colaborativa en tiempo real entre varios usuarios.
