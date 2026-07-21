# Speaksy Voices

Premium web app that turns conversational Markdown into realistic AI phone-call audio.

**Pipeline:** Markdown upload → DeepSeek V4 Flash conversation detection → Cartesia voice synthesis → merge turns → MP3/WAV export.

## Features

- **Multi-conversation detection** — unlimited independent scenarios in one `.md` file
- **DeepSeek V4 Flash** analysis with deterministic Markdown fallback
- **Cartesia Sonic** TTS for Agent + User (cloned or library voices)
- Natural inter-turn pauses for phone-call pacing
- Multilingual: English, Hindi, Hinglish, Telugu, Tamil, Kannada, Marathi, mixed
- Per-conversation progress, cancel, regenerate
- Download MP3/WAV + ZIP all
- Apple-inspired UI with dark / light mode

## Quick start

```bash
npm install
cp .env.example .env.local
# Add DEEPSEEK_API_KEY and CARTESIA_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo mode

Without `CARTESIA_API_KEY`, generation still runs with short tonal placeholders so you can exercise the full UI. Without `DEEPSEEK_API_KEY`, a local Markdown parser splits conversations by headings and `Agent:` / `User:` lines.

## Markdown format

```markdown
# Hinglish (EMI Reminder)

Agent:
Namaste! Main Priya bol rahi hoon...

User:
Haan, main Rahul bol raha hoon...

# Hindi (EMI Reminder)

Agent:
नमस्ते! मैं प्रिया बोल रही हूँ...

User:
हाँ, मैं राहुल बोल रहा हूँ...
```

Output files:

- `hinglish-emi-reminder.mp3`
- `hindi-emi-reminder.mp3`

A sample file is available in the UI (**Try sample**) and at `public/samples/emi-reminders.md`.

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DEEPSEEK_API_KEY` | Recommended | Conversation detection via DeepSeek V4 Flash |
| `DEEPSEEK_MODEL` | No | Default `deepseek-v4-flash` |
| `CARTESIA_API_KEY` | Recommended | Real TTS; demo tones without it |
| `CARTESIA_AGENT_VOICE_ID` | No | Cloned/library voice for Agent |
| `CARTESIA_USER_VOICE_ID` | No | Cloned/library voice for User |
| `CARTESIA_MODEL_ID` | No | Default `sonic-3.5` |

Create cloned voices in the [Cartesia playground](https://play.cartesia.ai/voices) and paste their IDs.

## Architecture

```
Upload .md
    ↓
POST /api/analyze  → DeepSeek (or deterministic parser)
    ↓
POST /api/generate → job + concurrent Cartesia TTS per turn
    ↓
SSE /api/generate?jobId=… → live progress
    ↓
PCM merge + pauses → WAV + MP3
    ↓
GET /api/audio/[jobId]/[file]
POST /api/download-all → ZIP
```

## Scripts

```bash
npm run dev      # development
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

## License

Private — all rights reserved.
