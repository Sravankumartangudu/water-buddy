# Changelog

## 1.2.0 — 2026-10-15

- **Appearance setting.** Settings has a new 🎨 **Appearance** card: **System**, **Light** or **Dark**. It changes at once.
  - **System** (the default) follows macOS, including Auto switching at sunset.
  - Droppy and friends look the same in every mode.

## 1.1.0 — 2026-10-13

- **Lives in Nexus's menu-bar folder.** With Nexus 1.6, Water Buddy's menu also shows in its submenu in Nexus, and picking an item there works the same as from Water Buddy's own tray icon.
  - Turn on **Keep Agents in Nexus** in Nexus to hide the tray icon. **Show Icon in Menu Bar** in Water Buddy's submenu keeps it.
  - If Nexus isn't running, the icon always shows.

## 1.0.3 — 2026-10-12

- Three new characters take turns with Droppy, each with its own animations, sounds and story:
  - **Nimbus**, a rain cloud: inhales the glass, rains on a flower bed, rides a rainbow. Skip it and it becomes a
    grumbling storm cloud.
  - **Glug**, a water bottle: rolls or bounces in, gets refilled, shakes until the cap pops, bottle-flips and rockets
    off. Skip it and it crumples, tips over and rolls away.
  - **Finn**, a goldfish: flops in out of water, gets a ball of water dropped on it, does loop-the-loops and dolphin
    leaps, blows a kiss. Skip it and it dries up in the sun.
- New **Who visits** setting: take turns (default) or always the same character. The Settings preview has buttons for
  each character and its moves.
- Droppy has new variations, picked at random each time: crawls or dashes in, burps, ta-da, cartwheels or moonwalks
  off, throws a tantrum or melts away.

## 1.0.2 — 2026-10-07

- Reports to [Nexus](https://github.com/Sravankumartangudu/nexus): Water Buddy writes a small heartbeat file to
  `~/.nexus/heartbeats/` every 30 seconds, so Nexus shows it as running ("on duty", or "reminders paused").
- Fixed: the installed app was missing the heartbeat file, so Nexus showed Water Buddy as Idle while it was running.

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
