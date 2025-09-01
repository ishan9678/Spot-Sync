import { SongInfo } from "@/types"

// State variables for sync checking
let hostSongInfo: SongInfo | null = null
let lastMismatchNotification = { key: '', timestamp: 0 }

// DOM functions
export function getSongInfo(): SongInfo {
  const title = document.querySelector('[data-testid="context-item-info-title"] a')?.textContent || ""
  const artist = document.querySelector('[data-testid="context-item-info-artist"]')?.textContent || ""
  const position = document.querySelector('[data-testid="playback-position"]')?.textContent || ""
  const duration = document.querySelector('[data-testid="playback-duration"]')?.textContent || ""
  const coverUrl = (document.querySelector('[data-testid="cover-art-image"]') as HTMLImageElement | null)?.src || undefined
  const playBtn = document.querySelector('[data-testid="control-button-playpause"]') as HTMLButtonElement | null
  const isPlaying = playBtn?.getAttribute("aria-label") === "Pause"
  const range = document.querySelector('[data-testid="playback-progressbar"] input[type="range"]') as HTMLInputElement | null
  const positionMs = range ? Number(range.value) || 0 : 0
  const durationMs = range ? Number(range.max) || 0 : 0
  return { title, artist, position, duration, isPlaying, positionMs, durationMs, coverUrl }
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

// Normalize song info for comparison
function normalizeSong(song: SongInfo | null) {
  if (!song) return null
  return {
    title: song.title?.toLowerCase().trim() || '',
    artist: song.artist?.toLowerCase().trim() || ''
  }
}

// Check if local song matches host song and sync position
function checkSyncMismatch() {
  if (!hostSongInfo) return // No host song to compare against
  
  const currentSong = getSongInfo()
  const hostNorm = normalizeSong(hostSongInfo)
  const currentNorm = normalizeSong(currentSong)
  
  console.log('[CONTENT] Checking sync - Host:', hostNorm, 'Current:', currentNorm)
  
  if (!hostNorm || !currentNorm) return
  
  // Check if songs match
  const songsMatch = hostNorm.title === currentNorm.title && hostNorm.artist === currentNorm.artist
  
  if (!songsMatch && hostNorm.title && currentNorm.title) {
    const key = `${hostSongInfo.title}—${hostSongInfo.artist}`
    const now = Date.now()
    
    // Only send notification if it's been more than 5 seconds since last one for this song
    if (key !== lastMismatchNotification.key || now - lastMismatchNotification.timestamp > 5000) {
      console.log('[CONTENT] Songs don\'t match - sending sync mismatch notification')
      lastMismatchNotification = { key, timestamp: now }
      
      chrome.runtime.sendMessage({
        type: 'SYNC_MISMATCH',
        hostSong: hostSongInfo,
        currentSong: currentSong
      })
    }
  } else if (songsMatch) {
    // Same song, sync play/pause state first
    if (hostSongInfo.isPlaying !== currentSong.isPlaying) {
      console.log(`[CONTENT] Play state out of sync - Host: ${hostSongInfo.isPlaying}, Current: ${currentSong.isPlaying}`)
      if (hostSongInfo.isPlaying) {
        console.log('[CONTENT] Host is playing, resuming playback')
        play()
      } else {
        console.log('[CONTENT] Host is paused, pausing playback')
        pause()
      }
      return // Don't check position if we just changed play state
    }
    
    // Only sync position if both are playing
    if (hostSongInfo.isPlaying && currentSong.isPlaying) {
      const hostPos = hostSongInfo.positionMs || 0
      const currentPos = currentSong.positionMs || 0
      const timeDiff = Math.abs(hostPos - currentPos)

      // If difference is more than 5  seconds, sync position
      if (timeDiff > 5000) {
        console.log(`[CONTENT] Position out of sync by ${timeDiff}ms, seeking to ${hostPos}ms`)
        seekTo(hostPos)
      }
    }
  }
}

// Listen to messages from background script
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
    case "HOST_SONG_UPDATE":
      // Store the host's current song for sync checking
      hostSongInfo = msg.song
      // Check sync immediately when host song updates
      checkSyncMismatch()
      break
  }
})

// Periodically send current song info and check sync
setInterval(() => {
  const song = getSongInfo()
  if (song.title) {
    chrome.runtime.sendMessage({ type: "SONG_INFO", song: song })
    
    // Check sync if we have host song info
    checkSyncMismatch()
  }
}, 1000)
