import { Routes, Route, Navigate } from 'react-router-dom'
import CandidatePage from './pages/CandidatePage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/agendar/:token" element={<CandidatePage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  )
}
