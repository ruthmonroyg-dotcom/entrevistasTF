import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminRouter } from './routes/admin.js';
import { scheduleRouter } from './routes/schedule.js';
import { connectDb, dbStatus } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

// Incluye el estado real de la conexión a la base de datos: si algo falla
// (credenciales, host, etc.), esto lo muestra en vez de dar solo un 503 ciego.
app.get('/api/health', (req, res) => res.json({ ok: true, db: dbStatus }));
app.use('/api/admin', adminRouter);
app.use('/api/schedule', scheduleRouter);

// Sirve el frontend ya compilado (npm run build en /client) para que el
// backend y la app web queden bajo la misma URL en producción.
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Nunca dejar que el proceso se caiga en silencio por un error no capturado
// (ej. un fallo de conexión a MySQL) — al menos queda el log y el servidor sigue vivo.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

const port = process.env.PORT || 4000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor de entrevistas escuchando en el puerto ${port}`);
  // La conexión a la base de datos se intenta DESPUÉS de que el servidor HTTP
  // ya está arriba, para que un fallo de conexión no impida levantar Express.
  connectDb();
});
