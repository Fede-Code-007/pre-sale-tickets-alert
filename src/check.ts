import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import nodemailer from "nodemailer";

// Película a detectar (se puede cambiar por variable de entorno para probar)
const MOVIE = new RegExp(
  process.env.MOVIE_REGEX ??
    "amanecer en la cosecha|sunrise on the reaping|hunger games|juegos del hambre|avengers",
  "i"
);
const UA = "Mozilla/5.0 (aviso-entradas personal bot)";

// Quita tildes y pasa a minúsculas
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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

// ---------- Los Cines de la Costa (Cinexo) ----------
const COSTA_BASE = "https://shopping.loscinesdelacosta.com.ar";
const COSTA_URL = `${COSTA_BASE}/es-AR/programacion`;

// Decodifica las entidades HTML más comunes (&amp;, &#39;, &#xE1;, etc.)
const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

async function checkCinesDeLaCosta(): Promise<boolean> {
  // La home carga la cartelera por JS; /programacion trae la lista completa
  // (en cartel + preventa) y cada título es un link a /programacion/<id>.
  const res = await fetch(COSTA_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "es-AR,es;q=0.9" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Cines de la Costa: HTTP ${res.status}`);
  const html = await res.text();

  const titles = [
    ...html.matchAll(
      /<a\b[^>]*href="[^"]*\/programacion\/\d+"[^>]*>([\s\S]*?)<\/a>/gi
    ),
  ]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t && !/^\d+$/.test(t)) // ignora los links que solo muestran el id
    .map(normalize);

  const unique = [...new Set(titles)];
  console.log(`Cines de la Costa: ${unique.length} títulos en programación`);
  if (unique.length === 0) {
    throw new Error(
      "Cines de la Costa: sin títulos (¿cambió el sitio o la lista ahora se carga por JS?)"
    );
  }
  return unique.some((t) => MOVIE.test(t));
}

const sites: Site[] = [
  { name: "Cinemacenter Corrientes", url: BASE, check: checkCinemacenter },
  { name: "Los Cines de la Costa (Centenario)", url: COSTA_URL, check: checkCinesDeLaCosta },
];

// ---------- Estado: qué sitios ya avisaron ----------
// El workflow guarda/restaura este archivo con actions/cache entre corridas.
const STATE_FILE = process.env.STATE_FILE ?? "state/notified.json";

function loadNotified(): Set<string> {
  try {
    if (existsSync(STATE_FILE)) {
      return new Set(JSON.parse(readFileSync(STATE_FILE, "utf8")) as string[]);
    }
  } catch (err) {
    console.error("No se pudo leer el estado, se empieza de cero:", err);
  }
  return new Set();
}

function saveNotified(notified: Set<string>) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify([...notified], null, 2));
}

const setOutput = (key: string, value: string) => {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
};

// ---------- Mail ----------
async function sendMail(site: Site) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.MAIL_TO || process.env.GMAIL_USER,
    subject: `🎬 ¡Ya hay entradas para Los Juegos del Hambre en ${site.name}!`,
    text: `Se detectó la película en ${site.name}:\n\n${site.url}\n\nCorré a comprar.`,
  });
}

// ---------- Main ----------
async function main() {
  const notified = loadNotified();

  for (const site of sites) {
    if (notified.has(site.name)) {
      console.log(`${site.name}: ya avisado, se omite`);
      continue;
    }
    try {
      const hit = await site.check();
      console.log(`${site.name}: ${hit ? "DETECTADA" : "todavía no"}`);
      if (hit) {
        // Primero el mail; si falla, no se marca como avisado y reintenta en la próxima corrida
        await sendMail(site);
        notified.add(site.name);
        saveNotified(notified);
        setOutput("changed", "true");
      }
    } catch (err) {
      // Un sitio caído no tiene que romper el chequeo de los demás
      console.error(`Error en ${site.name}:`, err);
    }
  }

  // Cuando ya avisaron todos los sitios, el workflow se puede deshabilitar
  if (sites.every((s) => notified.has(s.name))) setOutput("done", "true");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});