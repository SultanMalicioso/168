import type { Activity } from "./time-store";
import { weeklyHours } from "./time-store";

/** Draws a shareable card of the week and opens the system share sheet (or downloads it). */
export async function shareWeek(activities: Activity[]) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  await document.fonts?.ready;

  const probe = document.createElement("span");
  document.body.appendChild(probe);
  const resolve = (c: string) => {
    probe.style.color = c;
    return getComputedStyle(probe).color;
  };
  const items = activities
    .map((a) => ({ name: a.name, color: resolve(a.color), h: weeklyHours(a) }))
    .filter((a) => a.h > 0)
    .sort((x, y) => y.h - x.h);
  probe.remove();
  const used = items.reduce((t, a) => t + a.h, 0);
  const free = Math.max(0, 168 - used);

  ctx.fillStyle = "#faf9f7";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#111";
  ctx.font = "400 72px 'Instrument Serif', Georgia, serif";
  ctx.fillText("Mi semana en 168 horas", 80, 150);
  ctx.fillStyle = "#666";
  ctx.font = "500 34px Inter, system-ui, sans-serif";
  ctx.fillText(`${used.toFixed(1)}h planificadas · ${free.toFixed(1)}h libres`, 80, 210);

  const cx = W / 2;
  const cy = 560;
  const r = 250;
  ctx.lineWidth = 90;
  let start = -Math.PI / 2;
  for (const seg of [...items, { name: "", color: "#e7e5e1", h: free }]) {
    if (seg.h <= 0) continue;
    const end = start + (Math.min(seg.h, 168) / 168) * Math.PI * 2;
    ctx.strokeStyle = seg.color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
    start = end;
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#111";
  ctx.font = "400 120px 'Instrument Serif', Georgia, serif";
  ctx.fillText(`${Math.round((used / 168) * 100)}%`, cx, cy + 30);
  ctx.fillStyle = "#666";
  ctx.font = "500 28px Inter, system-ui, sans-serif";
  ctx.fillText("de la semana", cx, cy + 80);
  ctx.textAlign = "left";

  const shown = items.slice(0, 6);
  shown.forEach((a, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 80 + col * 470;
    const y = 960 + row * 80;
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.arc(x + 14, y - 12, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "600 32px Inter, system-ui, sans-serif";
    const label = a.name.length > 14 ? a.name.slice(0, 13) + "…" : a.name;
    ctx.fillText(label, x + 44, y);
    ctx.fillStyle = "#666";
    ctx.font = "500 32px Inter, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${a.h.toFixed(1)}h`, x + 420, y);
    ctx.textAlign = "left";
  });

  ctx.fillStyle = "#999";
  ctx.font = "500 26px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("168-theta.vercel.app", cx, H - 70);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "mi-semana-168.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Mi semana en 168 horas" });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
