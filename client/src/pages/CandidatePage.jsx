import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { scheduleApi } from '../api.js'
import LogosHeader from '../components/LogosHeader.jsx'

function formatDate(isoDate) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export default function CandidatePage() {
  const { token } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    setError('')
    scheduleApi.get(token).then(setState).catch((err) => setError(err.message))
  }

  useEffect(load, [token])

  const groupedSlots = useMemo(() => {
    if (!state?.availableSlots) return []
    const byDate = {}
    for (const slot of state.availableSlots) {
      byDate[slot.date] = byDate[slot.date] || []
      byDate[slot.date].push(slot)
    }
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
  }, [state])

  const book = async (slotId) => {
    setBusy(true)
    setError('')
    try {
      await scheduleApi.book(token, slotId)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await scheduleApi.confirm(token)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !state) {
    return (
      <div className="page">
        <div className="status-banner error">{error}</div>
      </div>
    )
  }

  if (!state) {
    return <div className="page">Cargando...</div>
  }

  const { candidate, bookedSlot } = state

  return (
    <div className="page">
      <LogosHeader />
      <h1>Entrevista — Formación en Terapia de Familia</h1>
      <p className="subtitle">UCAB · Entrevista virtual de 30 minutos por Zoom</p>

      {error && <div className="status-banner error">{error}</div>}

      {candidate.status === 'cancelado' && (
        <div className="status-banner error">
          Esta invitación fue cancelada. Si crees que es un error, contáctanos.
        </div>
      )}

      {candidate.status === 'confirmado' && bookedSlot && (
        <div className="card">
          <div className="status-banner success">
            Asistencia confirmada. Revisa tu correo, te enviamos las coordenadas de Zoom.
          </div>
          <p><strong>Fecha:</strong> {formatDate(bookedSlot.date)}</p>
          <p><strong>Hora:</strong> {bookedSlot.start_time} - {bookedSlot.end_time}</p>
        </div>
      )}

      {candidate.status === 'agendado' && bookedSlot && (
        <div className="card">
          <div className="status-banner info">
            Tu cita está agendada. Confirma tu asistencia para recibir el enlace de Zoom.
          </div>
          <p><strong>Fecha:</strong> {formatDate(bookedSlot.date)}</p>
          <p><strong>Hora:</strong> {bookedSlot.start_time} - {bookedSlot.end_time}</p>
          <button className="btn-primary" onClick={confirm} disabled={busy}>
            Confirmar mi asistencia
          </button>
        </div>
      )}

      {(candidate.status === 'invitado' || candidate.status === 'pendiente') && (
        <div className="card">
          <p>Hola {candidate.name}, elige el día y horario que prefieras:</p>
          {groupedSlots.length === 0 && <p>No hay horarios disponibles por el momento.</p>}
          {groupedSlots.map(([date, slots]) => (
            <div className="day-group" key={date}>
              <h3>{formatDate(date)}</h3>
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button
                    key={slot.id}
                    className="slot-btn"
                    disabled={busy}
                    onClick={() => book(slot.id)}
                  >
                    {slot.start_time}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
