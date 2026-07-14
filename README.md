# Entrevistas UCAB — Formación en Terapia de Familia

Coordina las entrevistas de 30 minutos (Zoom) para candidatos a la formación.

Flujo:
1. El admin importa candidatos y carga los horarios disponibles (cada uno con su link de Zoom).
2. El admin dispara el envío de invitaciones: cada candidato recibe un correo con un enlace personal.
3. El candidato entra al enlace, ve los horarios disponibles y elige uno. Al reservar, ese día/hora queda inhabilitado para los demás.
4. El candidato confirma su asistencia desde la misma página. Al confirmar, recibe un correo con las coordenadas de Zoom (link, ID, contraseña si aplica).

## Estructura

- `server/` — API en Node/Express + SQLite (better-sqlite3).
- `client/` — Frontend en React (Vite). Vista de candidato (`/agendar/:token`) y panel de admin (`/admin`).

## Poner en marcha

### 1. Backend

```
cd server
cp .env.example .env   # ya está copiado; edita los valores
npm install
npm run dev
```

Variables en `server/.env`:
- `ADMIN_KEY`: clave que usa el panel de admin (cámbiala).
- `APP_BASE_URL`: URL pública del frontend, usada para armar el enlace de agendamiento (en local: `http://localhost:5173`).
- Envío de correos (deja todas las opciones vacías para simular el envío en la consola del servidor). Orden de prioridad si hay varias configuradas: **SendGrid → Gmail → Resend**.
  - **SendGrid** (`SENDGRID_API_KEY` + `FROM_EMAIL`) — **la única que funciona en Render** (envía por HTTPS; Render bloquea SMTP saliente). Pasos:
    1. Crea una cuenta gratis en [sendgrid.com](https://signup.sendgrid.com/) (100 correos/día gratis).
    2. Ve a Settings → Sender Authentication → [Single Sender Verification](https://app.sendgrid.com/settings/sender_auth/senders) y verifica la cuenta que va a enviar (ej. `ciep.invedin@gmail.com`) — te llega un correo con un enlace de confirmación, no requiere DNS.
    3. Crea una API Key en Settings → API Keys (permisos "Full Access" o al menos "Mail Send").
    4. Pon `SENDGRID_API_KEY=` la key y `FROM_EMAIL=` el correo que verificaste.
  - **Gmail SMTP** (`GMAIL_USER` + `GMAIL_APP_PASSWORD`) — funciona en local, **no funciona en Render** (bloquea los puertos SMTP 465/587). Útil solo para probar en tu máquina. Pasos:
    1. Entra a la cuenta de Gmail que va a enviar los correos (ej. `ciep.invedin@gmail.com`).
    2. Activa la verificación en 2 pasos en [myaccount.google.com/security](https://myaccount.google.com/security) (obligatorio para poder generar contraseñas de aplicación).
    3. Ve a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), crea una con un nombre como "UCAB Entrevistas" y copia el código de 16 caracteres que te da Google.
    4. Pon `GMAIL_USER=esa-cuenta@gmail.com` y `GMAIL_APP_PASSWORD=` el código (no es tu contraseña normal de Gmail).
  - **Resend** (`RESEND_API_KEY` + `FROM_EMAIL`): requiere verificar un dominio propio en [resend.com/domains](https://resend.com/domains) (no funciona con `@gmail.com` ni otros dominios que no controles).

### 2. Frontend

```
cd client
npm install
npm run dev
```

Abre `http://localhost:5173/admin` e ingresa la `ADMIN_KEY`.

## Uso del panel de admin

**Cargar candidatos** — una línea por persona:
```
Ana Pérez, ana@example.com
Luis Gómez, luis@example.com
```

**Cargar horarios** — una línea por bloque de 30 min (a partir del miércoles 15):
```
2026-07-15, 09:00, 09:30, https://zoom.us/j/111, 111 2222 3333, clave123
2026-07-15, 09:30, 10:00, https://zoom.us/j/112, 111 2222 4444, clave123
```
El ID de reunión y la contraseña son opcionales.

**Enviar invitaciones** — envía el correo con el enlace de agendamiento a todos los candidatos en estado "pendiente".

## Estados del candidato

`pendiente` → `invitado` (se envió el correo) → `agendado` (eligió horario, slot bloqueado) → `confirmado` (confirmó asistencia, se envió el correo con Zoom).

## Notas

- Cada candidato tiene un enlace personal único (`/agendar/:token`); no requiere contraseña.
- Un horario reservado no puede ser tomado por otro candidato (se valida también a nivel de base de datos con una transacción).
- Los links de Zoom son fijos, se cargan manualmente por bloque horario junto con el resto de los datos del slot.

## Despliegue en Render

En producción, un solo servicio Node sirve tanto la API como la app de React ya compilada (no hace falta desplegar el frontend por separado ni configurar CORS).

1. **Sube el código a GitHub** (repo ya creado): `git push` al repositorio.
2. En [Render](https://dashboard.render.com), crea un **Web Service** nuevo apuntando a ese repositorio:
   - **Runtime:** Node
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Starter (o superior) — el plan Free borra el disco en cada reinicio/inactividad, y aquí necesitamos que los datos de candidatos y horarios persistan.
3. **Agrega un disco persistente** (pestaña "Disks" del servicio):
   - **Mount Path:** `/opt/render/project/src/server/data`
   - **Size:** 1 GB (de sobra)
4. **Variables de entorno** (pestaña "Environment"): agrega las mismas que tienes en `server/.env` — `ADMIN_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` (y `RESEND_API_KEY`/`FROM_EMAIL` si los usas). **No** copies `PORT` (Render lo asigna solo).
5. Una vez desplegado, Render te da una URL pública (ej. `https://ucab-entrevistas.onrender.com`). Agrega esa URL como variable de entorno `APP_BASE_URL` (sin `/` al final) — esto hace que los enlaces de los correos apunten a la app real en vez de `localhost`. Guardar la variable dispara un redeploy automático.
6. Verifica que el disco quedó bien montado entrando al "Shell" del servicio en Render y corriendo `ls server/data` — debe existir (o crearse) `entrevistas.db` ahí después de la primera acción que escriba en la base de datos.
