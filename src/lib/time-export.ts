import type { Activity } from "./time-store";
import { weeklyHours } from "./time-store";

export function exportCSV(activities: Activity[]) {
  const header = "Nombre,Categoría,Horas/día,Días/semana,Horas semanales,Color\n";
  const rows = activities
    .map((a) =>
      [a.name, a.category, a.hoursPerDay, a.daysPerWeek, weeklyHours(a), a.color]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
  download("semana.csv", "text/csv", header + rows);
}

export async function exportPNG(svgEl: SVGSVGElement | null) {
  if (!svgEl) return;
  const xml = new XMLSerializer().serializeToString(svgEl);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const image64 = "data:image/svg+xml;base64," + svg64;
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = image64;
  });
  const canvas = document.createElement("canvas");
  const size = 1200;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "semana.png";
  a.click();
}

export function exportPDF(activities: Activity[]) {
  // Lightweight: open printable window
  const total = activities.reduce((s, a) => s + weeklyHours(a), 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Mi semana</title>
    <style>
      body{font-family:Inter,system-ui,sans-serif;padding:40px;color:#111}
      h1{font-family:Georgia,serif;font-weight:400;font-size:32px;margin:0 0 8px}
      .muted{color:#666}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}
      th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#888}
      .chip{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:8px;vertical-align:middle}
    </style></head><body>
    <h1>Mi semana en 168 horas</h1>
    <div class="muted">${total.toFixed(1)}h ocupadas · ${(168 - total).toFixed(1)}h libres</div>
    <table><thead><tr><th>Actividad</th><th>Categoría</th><th>h/día</th><th>días</th><th>h/sem</th></tr></thead>
    <tbody>${activities
      .map(
        (a) =>
          `<tr><td><span class="chip" style="background:${a.color}"></span>${a.name}</td>
          <td>${a.category}</td><td>${a.hoursPerDay}</td><td>${a.daysPerWeek}</td><td>${weeklyHours(a).toFixed(1)}</td></tr>`,
      )
      .join("")}</tbody></table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function download(name: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
