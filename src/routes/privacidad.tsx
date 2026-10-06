import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de Privacidad · 168" },
      {
        name: "description",
        content:
          "Qué datos guarda 168, para qué los usa, con quién los comparte y cómo podés acceder a ellos o eliminarlos.",
      },
      { property: "og:title", content: "Política de Privacidad · 168" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

  return (
    <LegalPage title="Política de Privacidad">
      <p>
        Esta política explica qué datos personales trata 168 ({LEGAL.site}), para qué y cuáles son
        tus derechos, de acuerdo con la normativa de protección de datos personales aplicable.
      </p>

      <h2>1. Responsable</h2>
      <p>
        El responsable de los datos es {LEGAL.owner}. Podés escribir por cualquier consulta sobre
        privacidad a {mail}.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Sin cuenta:</strong> tus actividades, tareas, objetivos, temporizadores e
          historial se guardan solo en tu dispositivo. No los recibimos.
        </li>
        <li>
          <strong>Con cuenta:</strong> tu email y tu contraseña (que se guarda cifrada y que nunca
          vemos). Si entrás con Google, recibimos tu email y los datos básicos de perfil que Google
          comparte (nombre e imagen).
        </li>
        <li>
          <strong>Contenido de la app:</strong> con cuenta, tus actividades, tareas, objetivos,
          temporizadores, historial y ajustes de notificaciones se guardan en la nube para
          sincronizarlos entre tus dispositivos.
        </li>
        <li>
          <strong>Avisos con la app cerrada:</strong> si los activás, guardamos la dirección técnica
          de suscripción que genera tu navegador y tu zona horaria, para enviarte los avisos a la
          hora correcta.
        </li>
        <li>
          <strong>Registro de aceptación:</strong> la fecha y la versión de estos documentos que
          aceptaste y tu confirmación de edad.
        </li>
        <li>
          <strong>Datos técnicos:</strong> nuestros proveedores de alojamiento registran datos
          técnicos de cada solicitud (como la dirección IP) por seguridad. Usamos la IP de forma
          temporal para limitar intentos abusivos.
        </li>
      </ul>
      <p>
        No usamos publicidad, analíticas, grabación de sesiones ni rastreadores de terceros, y no
        vendemos ni alquilamos tus datos.
      </p>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Prestarte el servicio y sincronizar tus datos entre dispositivos.</li>
        <li>Enviarte los recordatorios y avisos que configures.</li>
        <li>Proteger la app contra abusos y accesos no autorizados.</li>
        <li>Responder tus consultas y solicitudes.</li>
      </ul>
      <p>
        Tratamos tus datos con tu consentimiento, que das al crear tu cuenta o al activar cada
        función, y porque son necesarios para prestarte el servicio que pedís.
      </p>

      <h2>4. Con quién los compartimos</h2>
      <p>Solo con los proveedores que hacen funcionar la app, que los tratan por nuestra cuenta:</p>
      <ul>
        <li>
          <strong>Supabase</strong>: base de datos e inicio de sesión. Servidores en Estados Unidos.
        </li>
        <li>
          <strong>Vercel</strong>: alojamiento de la app web.
        </li>
        <li>
          <strong>Lovable</strong> y <strong>Google</strong>: solo si elegís “Continuar con Google”.
        </li>
        <li>
          <strong>Servicios de notificaciones de tu navegador</strong> (Apple, Google o Mozilla):
          entregan los avisos a tu dispositivo, solo si los activás.
        </li>
      </ul>
      <p>
        Algunos de estos proveedores están en Estados Unidos u otros países. Al aceptar esta
        política consentís esa transferencia internacional. También podemos revelar datos si lo
        exige una autoridad competente según la ley.
      </p>

      <h2 id="cookies">5. Cookies y almacenamiento local</h2>
      <p>
        168 no usa cookies de publicidad ni de seguimiento. Usa el almacenamiento local de tu
        navegador solo para lo esencial: guardar tus datos en el dispositivo, mantener tu sesión
        iniciada y recordar preferencias (por ejemplo, que ya viste el aviso de almacenamiento). Sin
        eso la app no puede funcionar, por eso no pedimos un consentimiento aparte. Si entrás con
        Google, Google y Lovable pueden usar sus propias cookies durante ese inicio de sesión. Podés
        borrar este almacenamiento desde la configuración de tu navegador o desde{" "}
        <Link to="/auth">Tus datos y cuenta</Link>.
      </p>

      <h2>6. Cuánto tiempo los guardamos</h2>
      <ul>
        <li>Los datos de tu cuenta, mientras la tengas.</li>
        <li>
          Las tareas completadas se eliminan a las 24 horas y las de la papelera a las 12 horas.
        </li>
        <li>El registro de avisos enviados, 7 días.</li>
        <li>
          Si eliminás tu cuenta, borramos tus datos de inmediato. Las copias de seguridad de
          nuestros proveedores pueden conservarlos por un período limitado hasta que se
          sobrescriban.
        </li>
      </ul>

      <h2>7. Tus derechos</h2>
      <p>
        Tenés derecho a acceder a tus datos, rectificarlos, actualizarlos y suprimirlos, y a retirar
        tu consentimiento. Podés hacerlo directamente en <Link to="/auth">Tus datos y cuenta</Link>{" "}
        con “Descargar mis datos” y “Eliminar mi cuenta”, o escribiendo a {mail}. Respondemos los
        pedidos de acceso dentro de los 10 días corridos y los de rectificación o supresión dentro
        de los 5 días hábiles. El acceso a tus datos es gratuito. Si creés que no respetamos tus
        derechos, también podés reclamar ante la autoridad de protección de datos de tu país.
      </p>

      <h2>8. Menores de edad</h2>
      <p>
        168 no está dirigida a menores de {LEGAL.minAge} años y no permitimos que creen una cuenta.
        Si sos menor de 18, necesitás el permiso de tu madre, padre o tutor. Si sabemos que una
        cuenta pertenece a un menor de {LEGAL.minAge} años, la eliminamos junto con sus datos. Si
        creés que es el caso, escribinos a {mail}.
      </p>

      <h2>9. Seguridad</h2>
      <p>
        Usamos conexiones cifradas (HTTPS), las contraseñas se guardan cifradas y cada cuenta solo
        puede leer sus propios datos. Ningún sistema es completamente seguro, pero tomamos medidas
        razonables para proteger tu información.
      </p>

      <h2>10. Cambios a esta política</h2>
      <p>
        Si cambiamos esta política, actualizamos la fecha de arriba y, si el cambio es importante,
        te pedimos que la vuelvas a aceptar dentro de la app.
      </p>

      <h2>11. Contacto</h2>
      <p>
        {LEGAL.owner} · {mail}
      </p>
    </LegalPage>
  );
}
