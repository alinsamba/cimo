# Cimo 🎬

**Cimo** is a minimalist, distraction-free, high-performance cross-platform media player engineered for smooth playback, zero-copy GPU acceleration, rich subtitle styling, and deep OS integration.

---

## ⚡ Core Features

- **Hardware Acceleration & Video Pipeline:**
  - Zero-copy native texture rendering with automatic hardware decoding fallbacks.
  - Multi-format aspect ratio switcher (`contain`, `cover`, `16:9`, `4:3`, `21:9`, `fill`, `original`).
  - Frame-by-frame stepping forwards and backwards.
  - Native Picture-in-Picture (PiP) and Fullscreen modes.

- **Audio DSP & 200% Volume Boost:**
  - WebAudio DSP pipeline with **up to 200% volume boost** with dynamic headroom indicator.
  - 10-Band Parametric Equalizer (32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz).
  - 10 Built-in EQ Presets: *Flat, Bass Boost, Treble Boost, Vocal, Rock, Pop, Cinema, Night Mode, Acoustic, Electronic*.

- **Rich Subtitle Engine:**
  - **SubRip (`.srt`)**: Full parsing with HTML tags (`<b>`, `<i>`, `<u>`, `<font color="...">`).
  - **WebVTT (`.vtt`)**: Timestamp & cue settings alignment and styling.
  - **Advanced SubStation Alpha (`.ass` / `.ssa`)**: Multi-style parsing with colors, font overrides (`{\b1}`, `{\i1}`, `{\c&H...&}`), alignments (`{\an1-9}`), margins, and positioning.
  - Real-time subtitle offset/delay synchronization adjustment (±50ms increments).

- **Minimalist Floating HUD & Gestures:**
  - Auto-hiding distraction-free overlay with an idle timer (1.8s) resetting on mouse movement, keypress, or touch.
  - Scrubber timeline with hover timecode preview and buffer progress.
  - Mobile & touch edge gesture engine:
    - Left edge vertical swipe: **Brightness adjustment (0% – 100%)**.
    - Right edge vertical swipe: **Volume adjustment (0% – 200%)**.
    - Center horizontal swipe: **Seek scrub / jump preview**.
    - Double tap left / right: **Seek ±10s**.
    - Double tap center: **Toggle Play / Pause**.

- **Media Library & SQLite Database:**
  - Native `bun:sqlite` SQLite3 database for playlists, playback history, tags, and metadata caching.
  - Automatic resume playback position tracking.
  - Non-blocking recursive directory scanner for batch media ingestion.
  - Slide-out library drawer for instant queue reordering, playlist management, and search.

- **OS Integration:**
  - **Linux MPRIS2**: Full D-Bus interface (`org.mpris.MediaPlayer2.cimo`) for desktop media keys, volume control, and lock screen metadata.
  - **MediaSession API**: Cross-platform system media controls and artwork.
  - **XDG Desktop Integration**: `.desktop` application manifest with desktop actions (Play/Pause, Next, Prev, Stop) and complete MIME type associations.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` / `K` | Toggle Play / Pause |
| `ArrowLeft` / `ArrowRight` | Seek backward / forward 5s |
| `J` / `L` | Seek backward / forward 10s |
| `ArrowUp` / `ArrowDown` | Volume Up / Down (5% steps) |
| `M` | Toggle Mute |
| `F` / `F11` | Toggle Fullscreen |
| `Esc` | Exit Fullscreen / Close Drawer |
| `[` / `]` | Decrease / Increase Speed (0.1x steps) |
| `Backspace` | Reset Speed to 1.0x |
| `0` – `9` | Seek to 0% – 90% of duration |
| `,` / `.` | Step 1 frame backward / forward (when paused) |
| `S` | Cycle Subtitle tracks |
| `Z` / `X` | Subtitle delay -50ms / +50ms |
| `A` | Cycle Audio tracks |
| `C` | Cycle Aspect ratio (`contain`, `cover`, `16:9`, `4:3`, `21:9`, `fill`) |
| `N` / `Shift+P` | Next / Previous in queue |
| `R` | Cycle Repeat mode (Off → All → One) |
| `U` | Toggle Shuffle |
| `D` | Toggle Slide-Out Library Drawer |
| `P` | Toggle Picture-in-Picture |

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Run All Tests
```bash
bun test
```

### 3. Launch Cimo
```bash
# Start server & media player
bun run src/index.ts

# Open with specific files or scan a media folder
bun run src/index.ts /path/to/video.mp4 --scan ~/Videos
```

### 4. Build Standalone Linux Executable
```bash
./packaging/build-linux.sh
```
The compiled self-contained binary will be generated at `dist/bin/cimo`.

### 5. Install to User Applications
```bash
./packaging/install.sh
```
Installs the binary to `~/.local/bin/cimo` and integrates the `.desktop` launcher into your application menu.

---

## 🏗️ Project Architecture

```
cimo/
├── src/
│   ├── core/
│   │   ├── types.ts              # Core domain models, player state, tracks, cues
│   │   ├── events.ts             # Typed reactive EventEmitter & property streams
│   │   ├── controller.ts         # Central IMediaController state machine & queue
│   │   └── shortcuts.ts          # Desktop keyboard shortcuts engine
│   ├── engine/
│   │   ├── video.ts              # Video viewport, aspect ratios & frame stepping
│   │   ├── audio.ts              # WebAudio DSP, 200% volume booster & 10-band EQ
│   │   └── subtitles/
│   │       ├── srt.ts            # SubRip (.srt) parser
│   │       ├── vtt.ts            # WebVTT (.vtt) parser
│   │       ├── ass.ts            # Advanced SubStation Alpha (.ass/.ssa) parser
│   │       └── renderer.ts       # Timed subtitle cue renderer & styling
│   ├── database/
│   │   ├── schema.ts             # SQLite schema for media, playlists, history, tags
│   │   ├── db.ts                 # Native bun:sqlite database manager
│   │   └── scanner.ts            # Recursive directory scanner & metadata extractor
│   ├── os/
│   │   ├── mpris.ts              # Linux MPRIS2 D-Bus service & properties
│   │   ├── mediasession.ts       # Cross-platform MediaSession adapter
│   │   └── associations.ts       # File association descriptors & .desktop generator
│   ├── ui/
│   │   ├── index.html            # Minimalist single-page app HTML structure
│   │   ├── styles.css            # Distraction-free dark theme & glassmorphic HUD
│   │   ├── app.ts                # Application coordinator
│   │   ├── hud.ts                # Floating HUD overlay & idle auto-hide timer
│   │   ├── gestures.ts           # Mobile & touch edge gesture engine
│   │   └── drawer.ts             # Slide-out playlist & library drawer
│   ├── server.ts                 # Bun HTTP 206 byte-range streaming server & API
│   └── index.ts                  # CLI launcher entry point
├── test/
│   ├── controller.test.ts        # MediaController unit tests
│   ├── shortcuts.test.ts         # Shortcut engine unit tests
│   ├── subtitles.test.ts         # SRT, VTT, ASS parsers & renderer tests
│   ├── audio.test.ts             # Audio DSP, EQ presets & volume boost tests
│   ├── database.test.ts          # SQLite media library & history tests
│   ├── os.test.ts                # MPRIS2 & MediaSession integration tests
│   └── server.test.ts            # HTTP 206 streaming & REST API tests
└── packaging/
    ├── cimo.desktop              # XDG Desktop application entry
    ├── build-linux.sh            # Standalone compilation script
    └── install.sh                # Linux installation script
```

---

## 📜 License

MIT License.
