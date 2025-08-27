export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

export async function getActiveTabUrl(): Promise<string | undefined> {
  const tab = await getActiveTab()
  return tab?.url
}

export function isSpotifyUrl(url?: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    return u.hostname === 'open.spotify.com'
  } catch {
    return false
  }
}

export async function goToSpotify(options: { replaceCurrent?: boolean } = {}): Promise<void> {
  const { replaceCurrent = true } = options
  const target = 'https://open.spotify.com/'
  const tab = await getActiveTab()
  try {
    if (replaceCurrent && tab?.id) {
      await chrome.tabs.update(tab.id, { url: target })
      return
    }
  } catch {
    // fall through to create new tab
  }
  await chrome.tabs.create({ url: target })
}
