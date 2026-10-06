# Changelog

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
