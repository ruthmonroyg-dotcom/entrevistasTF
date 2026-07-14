import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { sendInvitationEmail, getEmailConfig } from '../lib/email.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// Diagnóstico temporal: qué proveedor de correo y FROM_EMAIL está usando el servidor.
adminRouter.get('/email-config', (req, res) => {
  res.json(getEmailConfig());
});

// --- Candidatos ---

// Body: { candidates: [{ name, email }, ...] }
adminRouter.post('/candidates', (req, res) => {
  const { candidates } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'Se esperaba { candidates: [{name, email}, ...] }' });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO candidates (name, email, token) VALUES (?, ?, ?)'
  );

  const inserted = [];
  const skipped = [];
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const name = (row.name || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      if (!name || !email) {
        skipped.push({ ...row, reason: 'nombre o correo faltante' });
        continue;
      }
      const result = insert.run(name, email, nanoid(24));
      if (result.changes > 0) {
        inserted.push({ id: result.lastInsertRowid, name, email });
      } else {
        skipped.push({ ...row, reason: 'correo ya existente' });
      }
    }
  });
  tx(candidates);

  res.json({ inserted, skipped });
});

adminRouter.get('/candidates', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.email, c.status, c.invited_at,
           s.date, s.start_time, s.end_time
    FROM candidates c
    LEFT JOIN slots s ON s.id = c.slot_id
    ORDER BY c.created_at DESC
  `).all();
  res.json({ candidates: rows });
});

adminRouter.delete('/candidates/:id', (req, res) => {
  const candidate = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!candidate) return res.status(404).json({ error: 'Candidato no encontrado' });

  const tx = db.transaction(() => {
    if (candidate.slot_id) {
      db.prepare('UPDATE slots SET is_available = 1, candidate_id = NULL WHERE id = ?').run(candidate.slot_id);
    }
    db.prepare('DELETE FROM candidates WHERE id = ?').run(candidate.id);
  });
  tx();

  res.json({ ok: true });
});

// --- Slots ---

// Body: { slots: [{ date, start_time, end_time, zoom_link, zoom_meeting_id?, zoom_password? }, ...] }
adminRouter.post('/slots', (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'Se esperaba { slots: [{date, start_time, end_time, zoom_link}, ...] }' });
  }

  const insert = db.prepare(`
    INSERT INTO slots (date, start_time, end_time, zoom_link, zoom_meeting_id, zoom_password)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.date || !row.start_time || !row.end_time || !row.zoom_link) {
        throw new Error(`Falta un campo requerido en el slot: ${JSON.stringify(row)}`);
      }
      const result = insert.run(
        row.date, row.start_time, row.end_time, row.zoom_link,
        row.zoom_meeting_id || null, row.zoom_password || null
      );
      created.push({ id: result.lastInsertRowid, ...row });
    }
  });

  try {
    tx(slots);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.json({ created });
});

adminRouter.get('/slots', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS candidate_name, c.email AS candidate_email
    FROM slots s
    LEFT JOIN candidates c ON c.id = s.candidate_id
    ORDER BY s.date, s.start_time
  `).all();
  res.json({ slots: rows });
});

adminRouter.delete('/slots/:id', (req, res) => {
  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot no encontrado' });
  if (slot.candidate_id) {
    return res.status(400).json({ error: 'No se puede eliminar un slot ya reservado' });
  }
  db.prepare('DELETE FROM slots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Invitaciones ---

// Envía el correo de invitación a todos los candidatos en estado 'pendiente'
// (o a una lista específica de ids si se envía { candidateIds: [...] })
adminRouter.post('/invite', async (req, res) => {
  const { candidateIds } = req.body || {};

  let candidates;
  if (Array.isArray(candidateIds) && candidateIds.length > 0) {
    const placeholders = candidateIds.map(() => '?').join(',');
    candidates = db.prepare(
      `SELECT * FROM candidates WHERE id IN (${placeholders})`
    ).all(...candidateIds);
  } else {
    candidates = db.prepare(`SELECT * FROM candidates WHERE status = 'pendiente'`).all();
  }

  const results = [];
  const markInvited = db.prepare(
    `UPDATE candidates SET status = 'invitado', invited_at = datetime('now') WHERE id = ?`
  );

  for (const candidate of candidates) {
    try {
      await sendInvitationEmail(candidate);
      markInvited.run(candidate.id);
      results.push({ id: candidate.id, email: candidate.email, ok: true });
    } catch (err) {
      results.push({ id: candidate.id, email: candidate.email, ok: false, error: err.message });
    }
  }

  res.json({ results });
});
