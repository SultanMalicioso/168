# Plan: Notificaciones push reales en tu celular

## Por qué hoy no te llegan

El cartel "este navegador no admite notificaciones" aparece porque estás viendo la app **dentro del visor de Lovable** (una ventana incrustada), donde el navegador bloquea las notificaciones. Además, en el celular las notificaciones web solo funcionan si la app está **instalada en la pantalla de inicio** (como una app común). El sistema de push con servidor ya está construido; falta hacer la app instalable y publicarla.

## Qué voy a hacer

### 1. Convertir la app en instalable (PWA)
- Crear `public/manifest.json` con nombre "Semana 168", colores de la app y modo pantalla completa.
- Generar íconos (192 y 512 px) a partir del logo de la app.
- Agregar las etiquetas necesarias en el HTML raíz: manifest, ícono de Apple, color de tema y modo standalone para iPhone.
- Registrar el service worker existente (`sw-notify.js`, que ya sabe recibir push) apenas carga la app, para que Android la ofrezca instalar.

### 2. Mejorar el aviso dentro de la app
- Cuando el navegador no permita notificaciones, en vez del cartel genérico mostrar instrucciones claras según el dispositivo:
  - **Android (Chrome):** abrir la dirección publicada → menú ⋮ → "Agregar a pantalla principal" → abrir el ícono → activar avisos.
  - **iPhone (Safari):** botón Compartir → "Agregar a pantalla de inicio" → abrir el ícono → activar avisos.
  - Botón "Copiar enlace" para mandarte la dirección al celular fácilmente.

### 3. Verificación
- Probar que el manifest y los íconos cargan bien y que la app queda instalable.
- Confirmar que el botón "Activar en este dispositivo" funciona una vez instalada.

### 4. Paso final tuyo (te lo dejo explicado)
- **Publicar** la app (los push del servidor apuntan a la dirección publicada).
- Abrir esa dirección en el celular, instalarla en la pantalla de inicio y activar los avisos desde la campana de notificaciones.

## Detalles técnicos
- Archivos nuevos: `public/manifest.json`, íconos PNG (generados con el logo de la app).
- Archivos modificados: `src/routes/__root.tsx` (head + registro del service worker), `src/components/notifications/NotificationCenter.tsx` (instrucciones por dispositivo).
- No se toca nada del sistema de push del servidor, ya funcionando (cron cada 5 minutos, deduplicación, zona horaria, horario silencioso).
- En iPhone, las notificaciones push web requieren iOS 16.4 o más y la app instalada; si tu iPhone es más viejo, los avisos funcionarán solo con la app abierta.
