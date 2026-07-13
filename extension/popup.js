// Popup: edit the endpoint/key and save the current tab on demand.

const endpointEl = document.getElementById('endpoint')
const apiKeyEl = document.getElementById('apiKey')
const statusEl = document.getElementById('status')

// Load saved config
chrome.storage.sync.get(['endpoint', 'apiKey'], items => {
  endpointEl.value = items.endpoint || ''
  apiKeyEl.value = items.apiKey || ''
})

function setStatus(msg, ok) {
  statusEl.textContent = msg
  statusEl.style.color = ok ? '#10B981' : '#C45D3E'
}

document.getElementById('save-settings').addEventListener('click', () => {
  const endpoint = endpointEl.value.trim().replace(/\/+$/, '')
  const apiKey = apiKeyEl.value.trim()
  if (!endpoint) return setStatus('Enter your app URL first.', false)
  chrome.storage.sync.set({ endpoint, apiKey }, () => setStatus('Settings saved.', true))
})

document.getElementById('save-page').addEventListener('click', async () => {
  const { endpoint, apiKey } = await new Promise(resolve =>
    chrome.storage.sync.get(['endpoint', 'apiKey'], resolve),
  )
  if (!endpoint) return setStatus('Save your settings first.', false)

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return setStatus('No active tab to save.', false)

  setStatus('Saving…', true)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const res = await fetch(`${endpoint.replace(/\/+$/, '')}/api/quick-save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: tab.url, title: tab.title }),
    })

    if (res.ok) setStatus('Saved to LinkVault ✓', true)
    else if (res.status === 401) setStatus('Unauthorized — check your API key.', false)
    else setStatus(`Save failed (${res.status}).`, false)
  } catch {
    setStatus('Network error — is the app reachable?', false)
  }
})
