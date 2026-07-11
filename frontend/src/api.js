const BASE = '/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && token) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    throw new Error('Sessao expirada')
  }

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição')
  }

  return data
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  me: () => request('/auth/me'),

  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getUsers: () => request('/users'),
  getUser: (id) => request(`/users/${id}`),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getDocuments: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/documents${qs ? `?${qs}` : ''}`)
  },
  getDocument: (id) => request(`/documents/${id}`),
  createDocument: (data) => request('/documents', { method: 'POST', body: JSON.stringify(data) }),
  updateDocument: (id, data) =>
    request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  uploadDocumentFile: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return request(`/documents/${id}/upload`, { method: 'POST', body: form })
  },
  uploadDocumentsBatch: (files, category_id, parent_id) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    if (category_id) form.append('category_id', category_id)
    if (parent_id) form.append('parent_id', parent_id)
    return request('/documents/batch', { method: 'POST', body: form })
  },
  renderDocument: (id) => request(`/documents/${id}/render`),
  downloadDocument: async (id, filename) => {
    const token = getToken()
    const res = await fetch(`${BASE}/documents/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Erro ao baixar')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  getCategories: () => request('/categories'),
  getCategory: (id) => request(`/categories/${id}`),
  createCategory: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  getFormats: () => request('/formats'),
  getFormat: (id) => request(`/formats/${id}`),
  createFormat: (data) => request('/formats', { method: 'POST', body: JSON.stringify(data) }),
  updateFormat: (id, data) => request(`/formats/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFormat: (id) => request(`/formats/${id}`, { method: 'DELETE' }),

  shareDocument: (id, userId) =>
    request(`/documents/${id}/share`, { method: 'POST', body: JSON.stringify({ userId }) }),
  unshareDocument: (id, userId) =>
    request(`/documents/${id}/share/${userId}`, { method: 'DELETE' }),
  getDocumentShares: (id) =>
    request(`/documents/${id}/shares`),
  generatePublicLink: (id) =>
    request(`/documents/${id}/public-link`, { method: 'POST' }),
  revokePublicLink: (id) =>
    request(`/documents/${id}/public-link`, { method: 'DELETE' }),
  shareDocumentWithGroup: (id, groupId) =>
    request(`/documents/${id}/share-group`, { method: 'POST', body: JSON.stringify({ groupId }) }),
  unshareDocumentFromGroup: (id, groupId) =>
    request(`/documents/${id}/share-group/${groupId}`, { method: 'DELETE' }),

  getGroups: () => request('/groups'),
  getGroup: (id) => request(`/groups/${id}`),
  createGroup: (data) => request('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id, data) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  addUserToGroup: (groupId, userId) =>
    request(`/groups/${groupId}/users`, { method: 'POST', body: JSON.stringify({ userId }) }),
  removeUserFromGroup: (groupId, userId) =>
    request(`/groups/${groupId}/users/${userId}`, { method: 'DELETE' }),

  webauthnRegisterOptions: (userId, username) =>
    fetch('/api/webauthn/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, username }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error)))),
  webauthnRegister: (userId, credential, deviceName, sessionId) =>
    fetch('/api/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, credential, deviceName, sessionId }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error)))),
  webauthnVerify: (credential, sessionId) =>
    fetch('/api/webauthn/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, sessionId }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error)))),
  webauthnLoginOptions: (username) =>
    fetch('/api/webauthn/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error || 'Nenhuma biometria')))),
  webauthnLogin: (username, credential, sessionId) =>
    fetch('/api/webauthn/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, credential, sessionId }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error)))),
  webauthnLoginDiscoverOptions: () =>
    fetch('/api/webauthn/login-discover-options', { method: 'POST' })
      .then((r) => r.json()),
  webauthnLoginDiscover: (credential, sessionId) =>
    fetch('/api/webauthn/login-discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, sessionId }),
    }).then((r) => r.json().then((d) => r.ok ? d : Promise.reject(new Error(d.error)))),
  webauthnStatus: (userId) =>
    request(`/webauthn/status/${userId}`),
  webauthnCredentials: (userId) =>
    request(`/webauthn/credentials/${userId}`),
  webauthnRemove: (userId) =>
    request(`/webauthn/${userId}`, { method: 'DELETE' }),
  webauthnRemoveCredential: (credentialId) =>
    request(`/webauthn/credential/${credentialId}`, { method: 'DELETE' }),
}
