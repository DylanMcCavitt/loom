---
name: summarize-youtube-videos
description: Summarize YouTube videos from a direct link or from a specific channel plus a natural-language reference. Use when the user wants one or more YouTube videos located, their transcripts pulled through Supadata, and the results summarized; especially when the user gives a channel handle/URL plus a topic, title fragment, or asks for the latest videos from a channel.
---

# Summarize Youtube Videos

## Overview
Use Supadata to resolve the right YouTube video or videos, fetch transcript text, and then summarize the results in your own words. Prefer the bundled helper script instead of hand-building API calls.

## Workflow
1. Identify the input mode.
   - If the user gives direct YouTube links, collect those videos directly.
   - If the user gives a channel plus a reference like "their video about evals" or "latest 3 uploads", resolve from the channel first.
2. Choose the cheapest safe transcript mode.
   - Default to `native` for channel sweeps or multi-video requests.
   - Use `auto` only when the user clearly wants fallback generation for videos that might not already have captions.
   - Avoid `generate` unless the user explicitly wants forced AI transcription.
3. Use `scripts/supadata_youtube.py`.
   - Start with `resolve` when the user reference is ambiguous and you want likely matches before spending transcript credits.
   - Use `collect` when you already know which videos to summarize.
4. Summarize from the returned transcript payload.
   - Lead with the actual substance of the video.
   - For multi-video requests, give one compact section per video plus a short cross-video synthesis if useful.
5. If Supadata returns an error, explain the real failure mode.
   - `206 transcript-unavailable`: no native transcript exists for that request mode.
   - `429 limit-exceeded`: the account is rate-limited; retry with fewer videos or more spacing.
   - `202` is not a failure; the helper script already polls transcript jobs until completion or timeout.

## Commands
Resolve likely matches without transcripts:

```bash
python3 ~/.agents/skills/summarize-youtube-videos/scripts/supadata_youtube.py resolve \
  --channel https://youtube.com/@CHANNEL_HANDLE \
  --query "topic or title fragment" \
  --limit 3
```

Collect transcripts from a channel query:

```bash
python3 ~/.agents/skills/summarize-youtube-videos/scripts/supadata_youtube.py collect \
  --channel https://youtube.com/@CHANNEL_HANDLE \
  --query "topic or title fragment" \
  --limit 2 \
  --lang en \
  --mode native
```

Collect transcripts from direct video URLs:

```bash
python3 ~/.agents/skills/summarize-youtube-videos/scripts/supadata_youtube.py collect \
  --video-url https://www.youtube.com/watch?v=VIDEO_ID \
  --lang en \
  --mode auto
```

Write large payloads to a file instead of flooding tool output:

```bash
python3 ~/.agents/skills/summarize-youtube-videos/scripts/supadata_youtube.py collect \
  --channel https://youtube.com/@CHANNEL_HANDLE \
  --limit 3 \
  --lang en \
  --mode native \
  --write-json /tmp/youtube-summary.json
```

## Defaults
- Default transcript language to `en`.
- Default transcript mode to `native`.
- Default channel listing to `--video-type video` unless the user explicitly wants Shorts or live uploads.
- Keep candidate resolution tight. Do not spray large searches or large channel sweeps unless the user asks for that breadth.
- Do not parallelize Supadata requests by default. The account can hit `429 limit-exceeded` on bursty request patterns.

## Credentials
The helper script reads the API key from either:
- `SUPADATA_API_KEY`
- `~/.agents/skills/summarize-youtube-videos/.supadata_api_key`

Prefer the environment variable if the user rotates keys later. The local key file is acceptable for this user’s local setup but should not be copied into a shared repo.

## Reference
Read [references/supadata-youtube-workflow.md](references/supadata-youtube-workflow.md) only when you need the lower-level endpoint behavior, cost notes, or command examples.
