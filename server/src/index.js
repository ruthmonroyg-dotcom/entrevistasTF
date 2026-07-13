import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminRouter } from './routes/admin.js';
import { scheduleRouter } from './routes/schedule.js';
import './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/admin', adminRouter);
app.use('/api/schedule', scheduleRouter);

// Sirve el frontend ya compilado (npm run build en /client) para que el
// backend y la app web queden bajo la misma URL en producción.
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Servidor de entrevistas escuchando en http://localhost:${port}`);
});
