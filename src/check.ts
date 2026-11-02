import { appendFileSync } from "node:fs";
import nodemailer from "nodemailer";

// Película a detectar (se puede cambiar por variable de entorno para probar)
const MOVIE = new RegExp(
  process.env.MOVIE_REGEX ??
    "amanecer en la cosecha|sunrise on the reaping|hunger games|juegos del hambre",
  "i"
);
const UA = "Mozilla/5.0 (aviso-entradas personal bot)";

// Quita tildes y pasa a minúsculas
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Site = { name: string; url: string; check: () => Promise<boolean> };

// ---------- Cinemacenter (miboleteria.com.ar) ----------
const BASE = "https://miboleteria.com.ar";
const CORRIENTES_ID = "4"; // ref="4" en la lista de ciudades

async function checkCinemacenter(): Promise<boolean> {
  // Mini "cookie jar": el sitio guarda la ciudad elegida en la sesión
  const jar = new Map<string, string>();
  const save = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const post = (path: string) =>
    fetch(`${BASE}/parts/${path}`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookie(),
      },
      body: new URLSearchParams({ cityId: CORRIENTES_ID }),
      signal: AbortSignal.timeout(20_000),
    });

  // 1) Abrir el sitio para obtener la sesión
  const r0 = await fetch(`${BASE}/`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  save(r0);

  // 2) Elegir Corrientes
  const r1 = await post("ajax_selectCity.php");
  if (!r1.ok) throw new Error(`selectCity: HTTP ${r1.status}`);
  save(r1);

  // 3) Pedir la cartelera de esa ciudad
  const r2 = await post("ajax_paso2.php");
  if (!r2.ok) throw new Error(`paso2: HTTP ${r2.status}`);

  const html = await r2.text();
  const titles = [...html.matchAll(/seleccionarMovie\('([^']+)'/g)].map((m) =>
    normalize(m[1])
  );
  console.log(`Cinemacenter: ${titles.length} títulos en cartelera`);
  if (titles.length === 0) {
    throw new Error("Cinemacenter: respuesta sin títulos (¿cambió el sitio o falló la sesión?)");
  }
  return titles.some((t) => MOVIE.test(t));
}

const sites: Site[] = [
  { name: "Cinemacenter Corrientes", url: BASE, check: checkCinemacenter },
  // Acá se agrega Los Cines de la Costa cuando tengamos su código
];

// ---------- Mail ----------
async function sendMail(found: Site[]) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  const lista = found.map((s) => `- ${s.name}: ${s.url}`).join("\n");
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.MAIL_TO || process.env.GMAIL_USER,
    subject: "🎬 ¡Ya hay entradas para Los Juegos del Hambre!",
    text: `Se detectó la película en:\n\n${lista}\n\nCorré a comprar.`,
  });
}

// ---------- Main ----------
async function main() {
  const found: Site[] = [];
  for (const site of sites) {
    try {
      const hit = await site.check();
      console.log(`${site.name}: ${hit ? "DETECTADA" : "todavía no"}`);
      if (hit) found.push(site);
    } catch (err) {
      // Un sitio caído no tiene que romper el chequeo de los demás
      console.error(`Error en ${site.name}:`, err);
    }
  }

  if (found.length > 0) {
    await sendMail(found);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "found=true\n");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});