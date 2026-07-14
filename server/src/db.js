import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR permite apuntar explícitamente al punto de montaje del disco persistente
// (ej. en Render: DATA_DIR=/data), en vez de asumir una ruta relativa al checkout del
// repo que puede no coincidir con el "Mount Path" configurado en el panel de Render.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'entrevistas.db');

fs.mkdirSync(dataDir, { recursive: true });
console.log(`[db] Usando base de datos en: ${dbPath}`);

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pendiente',
      -- pendiente | invitado | agendado | confirmado | cancelado
    slot_id INTEGER REFERENCES slots(id),
    invited_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,        -- YYYY-MM-DD
    start_time TEXT NOT NULL,  -- HH:MM
    end_time TEXT NOT NULL,    -- HH:MM
    zoom_link TEXT NOT NULL,
    zoom_meeting_id TEXT,
    zoom_password TEXT,
    is_available INTEGER NOT NULL DEFAULT 1,
    candidate_id INTEGER REFERENCES candidates(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_slots_date ON slots(date, start_time);
`);
