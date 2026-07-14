import { Router } from 'express';
import { nanoid } from 'nanoid';
import { query, queryOne, run, transaction } from '../db.js';
import { requireAdmin } from '../lib/adminAuth.js';
import { sendInvitationEmail, getEmailConfig } from '../lib/email.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// Envuelve un handler async para que los errores lleguen como 500 en vez de
// tumbar el proceso (Express 4 no captura rechazos de promesas automáticamente).
function asyncHandler(fn) {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message || 'Error interno' });
    });
  };
}

// Diagnóstico temporal: qué proveedor de correo y FROM_EMAIL está usando el servidor.
adminRouter.get('/email-config', (req, res) => {
  res.json(getEmailConfig());
});

// --- Candidatos ---

// Body: { candidates: [{ name, email }, ...] }
adminRouter.post('/candidates', asyncHandler(async (req, res) => {
  const { candidates } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'Se esperaba { candidates: [{name, email}, ...] }' });
  }

  const inserted = [];
  const skipped = [];

  await transaction(async (t) => {
    for (const row of candidates) {
      const name = (row.name || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      if (!name || !email) {
        skipped.push({ ...row, reason: 'nombre o correo faltante' });
        continue;
      }
      const result = await t.run(
        'INSERT IGNORE INTO candidates (name, email, token) VALUES (?, ?, ?)',
        [name, email, nanoid(24)]
      );
      if (result.affectedRows > 0) {
        inserted.push({ id: result.insertId, name, email });
      } else {
        skipped.push({ ...row, reason: 'correo ya existente' });
      }
    }
  });

  res.json({ inserted, skipped });
}));

adminRouter.get('/candidates', asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT c.id, c.name, c.email, c.status, c.invited_at,
           s.date, s.start_time, s.end_time
    FROM candidates c
    LEFT JOIN slots s ON s.id = c.slot_id
    ORDER BY c.created_at DESC
  `);
  res.json({ candidates: rows });
}));

adminRouter.delete('/candidates/:id', asyncHandler(async (req, res) => {
  const candidate = await queryOne('SELECT * FROM candidates WHERE id = ?', [req.params.id]);
  if (!candidate) return res.status(404).json({ error: 'Candidato no encontrado' });

  await transaction(async (t) => {
    if (candidate.slot_id) {
      await t.run('UPDATE slots SET is_available = 1, candidate_id = NULL WHERE id = ?', [candidate.slot_id]);
    }
    await t.run('DELETE FROM candidates WHERE id = ?', [candidate.id]);
  });

  res.json({ ok: true });
}));

// --- Slots ---

// Body: { slots: [{ date, start_time, end_time, zoom_link, zoom_meeting_id?, zoom_password? }, ...] }
adminRouter.post('/slots', asyncHandler(async (req, res) => {
  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'Se esperaba { slots: [{date, start_time, end_time, zoom_link}, ...] }' });
  }

  const created = [];

  try {
    await transaction(async (t) => {
      for (const row of slots) {
        if (!row.date || !row.start_time || !row.end_time || !row.zoom_link) {
          throw new Error(`Falta un campo requerido en el slot: ${JSON.stringify(row)}`);
        }
        const result = await t.run(
          `INSERT INTO slots (date, start_time, end_time, zoom_link, zoom_meeting_id, zoom_password)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [row.date, row.start_time, row.end_time, row.zoom_link, row.zoom_meeting_id || null, row.zoom_password || null]
        );
        created.push({ id: result.insertId, ...row });
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.json({ created });
}));

adminRouter.get('/slots', asyncHandler(async (req, res) => {
  const rows = await query(`
    SELECT s.*, c.name AS candidate_name, c.email AS candidate_email
    FROM slots s
    LEFT JOIN candidates c ON c.id = s.candidate_id
    ORDER BY s.date, s.start_time
  `);
  res.json({ slots: rows });
}));

adminRouter.delete('/slots/:id', asyncHandler(async (req, res) => {
  const slot = await queryOne('SELECT * FROM slots WHERE id = ?', [req.params.id]);
  if (!slot) return res.status(404).json({ error: 'Slot no encontrado' });
  if (slot.candidate_id) {
    return res.status(400).json({ error: 'No se puede eliminar un slot ya reservado' });
  }
  await run('DELETE FROM slots WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Invitaciones ---

// Envía el correo de invitación a todos los candidatos en estado 'pendiente'
// (o a una lista específica de ids si se envía { candidateIds: [...] })
adminRouter.post('/invite', asyncHandler(async (req, res) => {
  const { candidateIds } = req.body || {};

  let candidates;
  if (Array.isArray(candidateIds) && candidateIds.length > 0) {
    candidates = await query('SELECT * FROM candidates WHERE id IN (?)', [candidateIds]);
  } else {
    candidates = await query(`SELECT * FROM candidates WHERE status = 'pendiente'`);
  }

  const results = [];

  for (const candidate of candidates) {
    try {
      await sendInvitationEmail(candidate);
      await run(`UPDATE candidates SET status = 'invitado', invited_at = NOW() WHERE id = ?`, [candidate.id]);
      results.push({ id: candidate.id, email: candidate.email, ok: true });
    } catch (err) {
      results.push({ id: candidate.id, email: candidate.email, ok: false, error: err.message });
    }
  }

  res.json({ results });
}));
