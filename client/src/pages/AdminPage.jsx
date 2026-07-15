import { useEffect, useState } from 'react'
import { adminApi } from '../api.js'
import LogosHeader from '../components/LogosHeader.jsx'

function parseCandidatesInput(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email] = line.split(',').map((s) => s.trim())
      return { name, email }
    })
}

function parseSlotsInput(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date, start_time, end_time, zoom_link, zoom_meeting_id, zoom_password] =
        line.split(',').map((s) => s.trim())
      return { date, start_time, end_time, zoom_link, zoom_meeting_id, zoom_password }
    })
}

function formatDate(isoDate) {
  if (!isoDate) return isoDate
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '')
  const [candidates, setCandidates] = useState([])
  const [slots, setSlots] = useState([])
  const [candidatesInput, setCandidatesInput] = useState('')
  const [slotsInput, setSlotsInput] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const api = adminKey ? adminApi(adminKey) : null

  const clearKey = () => {
    setAdminKey('')
    localStorage.removeItem('adminKey')
  }

  const handleAuthError = (err) => {
    if (err.status === 401) {
      clearKey()
      setError('Clave de administrador incorrecta. Intenta de nuevo.')
    } else {
      setError(err.message)
    }
  }

  const refresh = () => {
    if (!api) return
    setError('')
    Promise.all([api.listCandidates(), api.listSlots()])
      .then(([c, s]) => {
        setCandidates(c.candidates)
        setSlots(s.slots)
      })
      .catch(handleAuthError)
  }

  useEffect(refresh, [adminKey])

  const saveKey = (key) => {
    setAdminKey(key)
    localStorage.setItem('adminKey', key)
  }

  const handleImportCandidates = async () => {
    setError('')
    setMessage('')
    try {
      const rows = parseCandidatesInput(candidatesInput)
      const result = await api.importCandidates(rows)
      setMessage(`Importados: ${result.inserted.length}. Omitidos: ${result.skipped.length}.`)
      setCandidatesInput('')
      refresh()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleCreateSlots = async () => {
    setError('')
    setMessage('')
    try {
      const rows = parseSlotsInput(slotsInput)
      const result = await api.createSlots(rows)
      setMessage(`Horarios creados: ${result.created.length}.`)
      setSlotsInput('')
      refresh()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleInvitePending = async () => {
    setError('')
    setMessage('')
    try {
      const result = await api.invite()
      const ok = result.results.filter((r) => r.ok).length
      const fail = result.results.length - ok
      setMessage(`Invitaciones enviadas: ${ok}. Fallidas: ${fail}.`)
      refresh()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleDeleteSlot = async (id) => {
    setError('')
    try {
      await api.deleteSlot(id)
      refresh()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleDeleteCandidate = async (id, name) => {
    if (!window.confirm(`¿Eliminar a ${name}? Si tenía un horario reservado, quedará disponible de nuevo.`)) return
    setError('')
    try {
      await api.deleteCandidate(id)
      refresh()
    } catch (err) {
      handleAuthError(err)
    }
  }

  if (!adminKey) {
    return (
      <div className="page">
        <LogosHeader />
        <h1>Panel de administración — Entrevistas de Admisión a la Certificación de Terapia de Familia UCAB IATF INVEDIN</h1>
        {error && <div className="status-banner error">{error}</div>}
        <div className="card">
          <div className="field">
            <label>Clave de administrador</label>
            <input type="password" autoFocus onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setError('')
                saveKey(e.currentTarget.value)
              }
            }} placeholder="Presiona Enter para entrar" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <LogosHeader />
      <h1>Panel de administración — Entrevistas de Admisión a la Certificación de Terapia de Familia UCAB IATF INVEDIN</h1>
      <p className="subtitle">Formación en Terapia de Familia</p>

      {message && <div className="status-banner success">{message}</div>}
      {error && <div className="status-banner error">{error}</div>}

      <div className="card">
        <h3>1. Cargar candidatos</h3>
        <p>Una línea por candidato: <code>Nombre completo, correo@ejemplo.com</code></p>
        <div className="field">
          <textarea rows={5} value={candidatesInput} onChange={(e) => setCandidatesInput(e.target.value)} placeholder="Ana Pérez, ana@example.com" />
        </div>
        <button className="btn-primary" onClick={handleImportCandidates} disabled={!candidatesInput.trim()}>
          Importar candidatos
        </button>
      </div>

      <div className="card">
        <h3>2. Cargar horarios disponibles</h3>
        <p>Una línea por bloque: <code>YYYY-MM-DD, HH:MM, HH:MM, link_zoom, id_reunion(opcional), clave(opcional)</code></p>
        <div className="field">
          <textarea rows={5} value={slotsInput} onChange={(e) => setSlotsInput(e.target.value)} placeholder="2026-07-15, 09:00, 09:30, https://zoom.us/j/123, 123 4567 8901, clave123" />
        </div>
        <button className="btn-primary" onClick={handleCreateSlots} disabled={!slotsInput.trim()}>
          Crear horarios
        </button>
      </div>

      <div className="card">
        <h3>3. Enviar invitaciones</h3>
        <p>Envía el correo de agendamiento a todos los candidatos en estado "pendiente".</p>
        <button className="btn-primary" onClick={handleInvitePending}>
          Enviar invitaciones pendientes
        </button>
      </div>

      <div className="card">
        <h3>Candidatos</h3>
        <table>
          <thead>
            <tr>
              <th>Nombre</th><th>Correo</th><th>Estado</th><th>Cita</th><th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td><span className={`tag ${c.status}`}>{c.status}</span></td>
                <td>{c.date ? `${formatDate(c.date)} ${c.start_time}-${c.end_time}` : '—'}</td>
                <td>
                  <button onClick={() => handleDeleteCandidate(c.id, c.name)} style={{ color: '#7a1212', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {candidates.length === 0 && (
              <tr><td colSpan={5}>Sin candidatos aún.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Horarios</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Hora</th><th>Disponible</th><th>Candidato</th><th></th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.date)}</td>
                <td>{s.start_time}-{s.end_time}</td>
                <td>{s.is_available ? 'Sí' : 'No'}</td>
                <td>{s.candidate_name || '—'}</td>
                <td>
                  {s.is_available === 1 && (
                    <button onClick={() => handleDeleteSlot(s.id)} style={{ color: '#7a1212', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {slots.length === 0 && (
              <tr><td colSpan={5}>Sin horarios aún.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
