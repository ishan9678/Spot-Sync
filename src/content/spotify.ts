export function getSongInfo() {
  const title = document.querySelector('[data-testid="context-item-info-title"] a')?.textContent || "";
  const artist = document.querySelector('[data-testid="context-item-info-artist"]')?.textContent || "";
  const position = document.querySelector('[data-testid="playback-position"]')?.textContent || "";
  const duration = document.querySelector('[data-testid="playback-duration"]')?.textContent || "";

  return { title, artist, position, duration };
}

setInterval(() => {
  const songInfo = getSongInfo();
  if (songInfo.title) {
    chrome.runtime.sendMessage({ type: "SONG_INFO", payload: songInfo });
  }
}, 1000);
