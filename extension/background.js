// Save to LinkVault — background service worker (MV3).
// Adds context-menu entries and POSTs the chosen link to /api/quick-save.

const MENU_LINK = 'linkvault-save-link'
const MENU_PAGE = 'linkvault-save-page'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_LINK,
    title: 'Save link to LinkVault',
    contexts: ['link'],
  })
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: 'Save this page to LinkVault',
    contexts: ['page'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_LINK && info.linkUrl) {
    save({ url: info.linkUrl })
  } else if (info.menuItemId === MENU_PAGE) {
    save({ url: info.pageUrl || tab?.url, title: tab?.title })
  }
})

/** Read the configured endpoint + key from sync storage. */
function getConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['endpoint', 'apiKey'], items => {
      resolve({ endpoint: items.endpoint || '', apiKey: items.apiKey || '' })
    })
  })
}

async function save({ url, title }) {
  if (!url) return flash('!', '#C45D3E')

  const { endpoint, apiKey } = await getConfig()
  if (!endpoint) {
    flash('SET', '#C45D3E') // not configured — open the popup to set it
    return
  }

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

    const res = await fetch(`${endpoint.replace(/\/+$/, '')}/api/quick-save`, {
      method: 'POST',
      headers,
      body: JSON.stringify(title ? { url, title } : { url }),
    })

    flash(res.ok ? '✓' : '!', res.ok ? '#10B981' : '#C45D3E')
  } catch {
    flash('!', '#C45D3E')
  }
}

/** Briefly show a status badge on the toolbar icon (no icon assets needed). */
function flash(text, color) {
  chrome.action.setBadgeBackgroundColor({ color })
  chrome.action.setBadgeText({ text })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500)
}
