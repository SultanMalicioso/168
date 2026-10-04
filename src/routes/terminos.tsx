import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos y Condiciones · 168" },
      {
        name: "description",
        content: "Condiciones de uso de 168, la app para planificar las 168 horas de tu semana.",
      },
      { property: "og:title", content: "Términos y Condiciones · 168" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const mail = <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

  return (
    <LegalPage title="Términos y Condiciones">
      <p>
        Estos términos regulan el uso de 168 ({LEGAL.site}), una app ofrecida por {LEGAL.owner}. Al
        usar la app o crear una cuenta aceptás estos términos y la{" "}
        <Link to="/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>1. Quién puede usarla</h2>
      <p>
        Tenés que tener {LEGAL.minAge} años o más. Si sos menor de 18, necesitás el permiso de tu
        madre, padre o tutor.
      </p>

      <h2>2. El servicio</h2>
      <p>
        168 es una herramienta para planificar y registrar cómo usás las horas de tu semana:
        actividades, tareas, objetivos, temporizadores, calendario y recordatorios. Podés usarla sin
        cuenta, con los datos guardados solo en tu dispositivo, o con una cuenta para
        sincronizarlos.
      </p>

      <h2>3. Precio</h2>
      <p>
        168 es gratuita. No tiene suscripciones, pagos, renovaciones automáticas ni cargos ocultos,
        así que no hay nada que reembolsar ni cancelar. Si en el futuro agregamos funciones pagas,
        vas a ver el precio, la forma de renovación y cómo cancelar antes de contratarlas, y nunca
        te vamos a cobrar sin tu aceptación expresa.
      </p>

      <h2>4. Tu cuenta</h2>
      <ul>
        <li>Tenés que dar un email real y mantener tu contraseña en secreto.</li>
        <li>Sos responsable de lo que se haga con tu cuenta.</li>
        <li>
          Podés eliminarla cuando quieras desde <Link to="/auth">Tus datos y cuenta</Link>, sin
          costo y sin dar explicaciones.
        </li>
      </ul>

      <h2>5. Uso aceptable</h2>
      <p>No podés usar 168 para:</p>
      <ul>
        <li>Intentar acceder a cuentas o datos de otras personas.</li>
        <li>Atacar, sobrecargar o interferir con la app o sus servidores.</li>
        <li>Cualquier actividad ilegal.</li>
      </ul>
      <p>Si no cumplís estos términos podemos suspender o cerrar tu cuenta.</p>

      <h2>6. Tu contenido</h2>
      <p>
        Lo que cargás en 168 es tuyo y es privado: nadie más lo ve. Solo lo guardamos y procesamos
        para prestarte el servicio, como explica la Política de Privacidad.
      </p>

      <h2>7. Recordatorios</h2>
      <p>
        Los avisos dependen de tu dispositivo, tu navegador y tu conexión, y pueden llegar tarde o
        no llegar. No uses 168 como único recordatorio para asuntos críticos, como tomar medicación.
      </p>

      <h2>8. Disponibilidad y responsabilidad</h2>
      <p>
        Hacemos lo posible para que 168 funcione bien, pero se ofrece “tal como está”: puede tener
        errores, cambiar o interrumpirse. Te recomendamos guardar una copia con “Descargar mis
        datos”. En la medida en que la ley lo permita, no somos responsables por daños indirectos
        derivados del uso de la app. Nada de esto limita los derechos que te da la ley de defensa
        del consumidor que corresponda.
      </p>

      <h2>9. Propiedad intelectual y licencias</h2>
      <p>
        El nombre, el diseño y el código de 168 pertenecen a sus creadores. La app usa recursos de
        terceros con licencias que permiten este uso:
      </p>
      <ul>
        <li>
          Tipografías Inter e Instrument Serif, bajo la{" "}
          <a href="https://openfontlicense.org" target="_blank" rel="noopener noreferrer">
            SIL Open Font License 1.1
          </a>
          .
        </li>
        <li>
          Íconos de{" "}
          <a href="https://lucide.dev/license" target="_blank" rel="noopener noreferrer">
            Lucide
          </a>
          , bajo la licencia ISC.
        </li>
        <li>Componentes de código abierto bajo licencia MIT.</li>
      </ul>

      <h2>10. Cambios a estos términos</h2>
      <p>
        Si los cambiamos, actualizamos la fecha de arriba y, si el cambio es importante, te pedimos
        que los vuelvas a aceptar dentro de la app.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>
        Cualquier conflicto se resolverá ante los tribunales competentes según la normativa de
        defensa del consumidor aplicable.
      </p>

      <h2>12. Contacto</h2>
      <p>
        {LEGAL.owner} · {mail}
      </p>
    </LegalPage>
  );
}
