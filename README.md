# Monitor de venta de entradas de cine

Monitor automatizado de disponibilidad de entradas de cine que verifica periódicamente las carteleras para detectar el inicio de la preventa de *Los Juegos del Hambre: Amanecer en la cosecha* y enviar notificaciones por correo electrónico cuando la película aparezca disponible.

El proyecto utiliza **Node.js, TypeScript, GitHub Actions y Nodemailer** para monitorear los sitios web de los cines sin necesidad de mantener un servidor en funcionamiento permanente.

## Características

- **Soporte para múltiples cines:** monitorea Cinemacenter Corrientes y Los Cines de la Costa (Centenario).
- **Monitoreo automático:** ejecuta comprobaciones cada 5 minutos mediante GitHub Actions.
- **Detección por variantes del título:** admite diferentes denominaciones de la película en español e inglés.
- **Notificaciones por correo electrónico:** envía alertas mediante Gmail cuando detecta la película.
- **Prevención de notificaciones duplicadas:** registra los cines que ya generaron una notificación para evitar el envío repetido de correos.
- **Persistencia del estado:** utiliza GitHub Actions Cache para conservar el registro de notificaciones entre ejecuciones.
- **Desactivación automática:** deshabilita el workflow cuando todos los cines monitoreados ya generaron sus notificaciones.
- **Ejecución manual:** permite iniciar una comprobación desde GitHub Actions.

## Cines monitoreados

| Cine | Ubicación | Sitio web |
|---|---|---|
| Cinemacenter | Corrientes | [miboleteria.com.ar](https://miboleteria.com.ar) |
| Los Cines de la Costa | Shopping Centenario | [Programación](https://shopping.loscinesdelacosta.com.ar/es-AR/programacion) |

## Tecnologías utilizadas

- **Node.js:** entorno de ejecución de JavaScript.
- **TypeScript:** desarrollo de la aplicación.
- **Nodemailer:** envío de correos electrónicos mediante Gmail.
- **tsx:** ejecución de código TypeScript.
- **GitHub Actions:** automatización y ejecución programada.
- **GitHub Actions Cache:** persistencia del estado de las notificaciones.

## Funcionamiento

1. GitHub Actions inicia el workflow cada 5 minutos.
2. Se descarga el repositorio y se configura Node.js 22.
3. Se instalan las dependencias mediante `npm ci`.
4. Se recupera el estado de las notificaciones anteriores desde GitHub Actions Cache.
5. La aplicación consulta los sitios web de los cines para detectar la película.
6. Si encuentra la película en un cine que todavía no generó una notificación:
   - Envía un correo electrónico mediante Gmail.
   - Registra el cine como notificado.
   - Guarda el estado actualizado.
7. Cuando todos los cines monitoreados generaron sus notificaciones, el workflow se deshabilita automáticamente.

Si falla la consulta a un cine o el envío del correo, ese cine no se registra como notificado, permitiendo reintentar la operación en una ejecución posterior.

## Estructura del proyecto

```text
pre-sale-tickets-alert/
│
├── .github/
│   └── workflows/
│       └── watch.yml
│
├── src/
│   └── check.ts
│
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Requisitos

- Node.js 22 o superior.
- npm.
- Una cuenta de GitHub.
- Una cuenta de Gmail con verificación en dos pasos habilitada.
- Una contraseña de aplicación de Google (App Password).

## Configuración

La aplicación utiliza variables de entorno para configurar la detección de películas y el envío de notificaciones.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GMAIL_USER` | Sí | Dirección de Gmail utilizada para enviar las notificaciones. |
| `GMAIL_APP_PASSWORD` | Sí | Contraseña de aplicación de Gmail (16 caracteres). |
| `MAIL_TO` | No | Dirección de correo destinataria. Si no se especifica, se utiliza `GMAIL_USER`. |
| `MOVIE_REGEX` | No | Expresión regular personalizada para detectar variantes del título de la película. |
| `STATE_FILE` | No | Ruta personalizada del archivo de estado. Por defecto, `state/notified.json`. |

### Configuración de secretos en GitHub

Para que el workflow pueda enviar correos electrónicos, es necesario configurar los siguientes secretos:

1. Ingresar al repositorio en GitHub.
2. Acceder a **Settings → Secrets and variables → Actions**.
3. Crear los siguientes secretos:

| Secreto | Valor |
|---|---|
| `GMAIL_USER` | Tu dirección de Gmail. |
| `GMAIL_APP_PASSWORD` | Tu contraseña de aplicación de Gmail. |
| `MAIL_TO` | Dirección de correo donde recibir las notificaciones (opcional). |

Para generar una contraseña de aplicación, ingresar a [Seguridad de la cuenta de Google](https://myaccount.google.com/security) y habilitar la verificación en dos pasos si todavía no está configurada.

**Importante:** nunca se deben incluir credenciales de Gmail ni otros datos sensibles directamente en el repositorio.

## Ejecución local

Clonar el repositorio:

```bash
git clone https://github.com/TU_USUARIO/pre-sale-tickets-alert.git
cd pre-sale-tickets-alert
```

Instalar las dependencias:

```bash
npm ci
```

Configurar las variables de entorno:

```env
GMAIL_USER=tu-correo@gmail.com
GMAIL_APP_PASSWORD=tu-contraseña-de-aplicacion
MAIL_TO=destinatario@example.com
```

Ejecutar el monitor:

```bash
npx tsx src/check.ts
```

La aplicación consultará los cines configurados y mostrará los resultados de cada comprobación en la terminal.

## Automatización con GitHub Actions

El workflow se encuentra definido en `.github/workflows/watch.yml`.

Admite dos modalidades de ejecución:

- **Ejecución programada:** cada 5 minutos.
- **Ejecución manual:** mediante el evento `workflow_dispatch` desde la interfaz de GitHub Actions.

Para conservar el estado de las notificaciones entre ejecuciones, se utiliza GitHub Actions Cache.

Una vez que todos los cines hayan generado una notificación, el workflow se deshabilita automáticamente para evitar ejecuciones innecesarias.

Para volver a monitorear, es necesario habilitar manualmente el workflow desde la interfaz de GitHub Actions.

## Avisos importantes

Este es un proyecto personal y no oficial, desarrollado con fines educativos y prácticos.

La aplicación no realiza compras de entradas, reservas ni garantiza la disponibilidad de las mismas. Su única función es detectar publicaciones de películas que coincidan con los patrones de búsqueda configurados.

La confiabilidad del monitoreo depende de la disponibilidad y estructura de los sitios web de los cines. Los cambios en su HTML, endpoints o mecanismos de publicación pueden requerir modificaciones en los respectivos verificadores.

