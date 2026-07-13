import { Router } from 'express';
import { db } from '../db.js';
import { sendZoomConfirmationEmail } from '../lib/email.js';

export const scheduleRouter = Router();

function getCandidateByToken(token) {
  return db.prepare('SELECT * FROM candidates WHERE token = ?').get(token);
}

// Estado del candidato + slots disponibles (o el slot ya asignado)
scheduleRouter.get('/:token', (req, res) => {
  const candidate = getCandidateByToken(req.params.token);
  if (!candidate) return res.status(404).json({ error: 'Enlace inválido' });

  if (candidate.status === 'cancelado') {
    return res.json({ candidate: publicCandidate(candidate), availableSlots: [], bookedSlot: null });
  }

  if (candidate.slot_id) {
    const bookedSlot = db.prepare('SELECT * FROM slots WHERE id = ?').get(candidate.slot_id);
    return res.json({ candidate: publicCandidate(candidate), availableSlots: [], bookedSlot });
  }

  const availableSlots = db.prepare(`
    SELECT id, date, start_time, end_time FROM slots
    WHERE is_available = 1
    ORDER BY date, start_time
  `).all();

  res.json({ candidate: publicCandidate(candidate), availableSlots, bookedSlot: null });
});

// Reservar un horario: agenda la cita e inhabilita el slot
scheduleRouter.post('/:token/book', (req, res) => {
  const candidate = getCandidateByToken(req.params.token);
  if (!candidate) return res.status(404).json({ error: 'Enlace inválido' });
  if (candidate.status === 'cancelado') return res.status(400).json({ error: 'Esta invitación fue cancelada' });
  if (candidate.slot_id) return res.status(400).json({ error: 'Ya tienes una cita agendada' });

  const { slotId } = req.body;
  if (!slotId) return res.status(400).json({ error: 'Falta slotId' });

  const tx = db.transaction(() => {
    const slot = db.prepare('SELECT * FROM slots WHERE id = ? AND is_available = 1').get(slotId);
    if (!slot) {
      const err = new Error('Ese horario ya no está disponible');
      err.status = 409;
      throw err;
    }
    db.prepare('UPDATE slots SET is_available = 0, candidate_id = ? WHERE id = ?').run(candidate.id, slotId);
    db.prepare(`UPDATE candidates SET status = 'agendado', slot_id = ? WHERE id = ?`).run(slotId, candidate.id);
    return slot;
  });

  try {
    const slot = tx();
    res.json({ ok: true, slot });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Confirmar asistencia: dispara el correo con las coordenadas de Zoom
scheduleRouter.post('/:token/confirm', async (req, res) => {
  const candidate = getCandidateByToken(req.params.token);
  if (!candidate) return res.status(404).json({ error: 'Enlace inválido' });
  if (!candidate.slot_id) return res.status(400).json({ error: 'No tienes una cita agendada aún' });
  if (candidate.status === 'confirmado') return res.status(400).json({ error: 'Ya confirmaste tu asistencia' });

  const slot = db.prepare('SELECT * FROM slots WHERE id = ?').get(candidate.slot_id);

  db.prepare(`UPDATE candidates SET status = 'confirmado' WHERE id = ?`).run(candidate.id);

  try {
    await sendZoomConfirmationEmail({
      name: candidate.name,
      email: candidate.email,
      date: slot.date,
      startTime: slot.start_time,
      endTime: slot.end_time,
      zoomLink: slot.zoom_link,
      zoomMeetingId: slot.zoom_meeting_id,
      zoomPassword: slot.zoom_password,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Confirmado, pero falló el envío del correo: ' + err.message });
  }

  res.json({ ok: true });
});

// Cancelar: libera el slot para que otro candidato lo pueda tomar
scheduleRouter.post('/:token/cancel', (req, res) => {
  const candidate = getCandidateByToken(req.params.token);
  if (!candidate) return res.status(404).json({ error: 'Enlace inválido' });

  const tx = db.transaction(() => {
    if (candidate.slot_id) {
      db.prepare('UPDATE slots SET is_available = 1, candidate_id = NULL WHERE id = ?').run(candidate.slot_id);
    }
    db.prepare(`UPDATE candidates SET status = 'invitado', slot_id = NULL WHERE id = ?`).run(candidate.id);
  });
  tx();

  res.json({ ok: true });
});

function publicCandidate(candidate) {
  const { token, ...rest } = candidate;
  return rest;
}
