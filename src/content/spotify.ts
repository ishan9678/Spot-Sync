export type SongInfo = {
  title: string
  artist: string
  position: string
  duration: string
}

// DOM functions
export function getSongInfo(): SongInfo {
  const title = document.querySelector('[data-testid="context-item-info-title"] a')?.textContent || ""
  const artist = document.querySelector('[data-testid="context-item-info-artist"]')?.textContent || ""
  const position = document.querySelector('[data-testid="playback-position"]')?.textContent || ""
  const duration = document.querySelector('[data-testid="playback-duration"]')?.textContent || ""
  return { title, artist, position, duration }
}

function play() {
  const btn = document.querySelector('[data-testid="control-button-playpause"]') as HTMLButtonElement
  if (btn?.getAttribute("aria-label") === "Play") btn.click()
}

function pause() {
  const btn = document.querySelector('[data-testid="control-button-playpause"]') as HTMLButtonElement
  if (btn?.getAttribute("aria-label") === "Pause") btn.click()
}

function togglePlayPause() {
  const btn = document.querySelector('[data-testid="control-button-playpause"]') as HTMLButtonElement
  if (btn) btn.click()
}

function seekTo(ms: number) {
  const range = document.querySelector('[data-testid="playback-progressbar"] input[type="range"]') as HTMLInputElement
  if (range) {
    range.value = String(ms)
    range.dispatchEvent(new Event("input", { bubbles: true }))
    range.dispatchEvent(new Event("change", { bubbles: true }))
  }
}

// Listen to messages from popup via background
chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "PLAY":
      play()
      break
    case "PAUSE":
      pause()
      break
    case "TOGGLE":
      togglePlayPause()
      break
    case "SEEK":
      seekTo(msg.ms)
      break
  }
})

// Periodically send current song info to background/popup
setInterval(() => {
  const song = getSongInfo()
  if (song.title) {
    chrome.runtime.sendMessage({ type: "SONG_INFO", payload: song })
  }
}, 1000)
