async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const scheduleApi = {
  get: (token) => request(`/schedule/${token}`),
  book: (token, slotId) => request(`/schedule/${token}/book`, { method: 'POST', body: JSON.stringify({ slotId }) }),
  confirm: (token) => request(`/schedule/${token}/confirm`, { method: 'POST' }),
};

export function adminApi(adminKey) {
  const headers = { 'x-admin-key': adminKey };
  return {
    listCandidates: () => request('/admin/candidates', { headers }),
    importCandidates: (candidates) => request('/admin/candidates', { method: 'POST', headers, body: JSON.stringify({ candidates }) }),
    deleteCandidate: (id) => request(`/admin/candidates/${id}`, { method: 'DELETE', headers }),
    listSlots: () => request('/admin/slots', { headers }),
    createSlots: (slots) => request('/admin/slots', { method: 'POST', headers, body: JSON.stringify({ slots }) }),
    deleteSlot: (id) => request(`/admin/slots/${id}`, { method: 'DELETE', headers }),
    invite: (candidateIds) => request('/admin/invite', { method: 'POST', headers, body: JSON.stringify({ candidateIds }) }),
  };
}
