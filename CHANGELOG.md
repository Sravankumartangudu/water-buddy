# Changelog

## 1.0.1 — 2026-10-06

- Reminders can no longer stop for good: if Droppy's window crashes, hangs or fails to load, it closes after a few
  minutes and counts as "Remind me later".
- The glass count resets on screen at midnight. A Settings window left open overnight can no longer bring back
  yesterday's count.
- Settings no longer pops up at every login, only when you open the app yourself. It now opens in front of other apps.
- The Dock icon no longer disappears while Droppy is on screen with Settings open.
- Dropping a photo onto Settings crops it instead of replacing the window. Unsupported photos (such as HEIC) show a
  message.
- Switching from My photo to Droppy and back shows your photo again.
- Settings are saved atomically and checked on load. A damaged settings file is kept as `settings.json.bad` and the
  app starts with defaults.
- Removed the leftover skin/shirt/pants colour pickers from the old human avatar. Photo faces are stored smaller (WebP).
- `npm run dist` works on Intel Macs and no longer removes the installed app if the build fails.

## 1.0 — 2026-10-06

- Menu-bar water reminder: pick an interval, snooze length, active hours and a daily goal. The drop icon in the menu bar
  shows today's count.
- **Droppy**, an original water-drop mascot drawn live with Three.js, walks on screen to ask if you've had water. Its
  body is a hydration gauge: it fills up and dances when you drink, and dries out under a smug sun when you skip.
- A "why drink water" fact with every reminder, and benefit tags during the splash dance.
- Optional photo mode: put your own face on Droppy's front.
- Synthesized sound effects and a marimba splash-dance tune (no audio files).
- App icon and menu-bar icon rendered from Droppy (`npm run icons`).
- Downloadable universal DMG (Apple silicon and Intel) on the releases page, or build it yourself with `npm run package`.
  `npm run dist` builds and installs **Water Buddy.app** from source. It shows in the Dock only while Settings is open.
