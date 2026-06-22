# Supadata YouTube Workflow

Use this reference only when the helper script or request needs lower-level reasoning.

## Primary endpoints

- `GET /v1/youtube/channel`
  - Resolve a channel URL, handle, or channel ID into canonical channel metadata.
- `GET /v1/youtube/channel/videos`
  - Return latest video IDs from a channel.
  - Response keeps `videoIds`, `shortIds`, and `liveIds` separate.
  - Results are latest-first.
- `GET /v1/youtube/search`
  - Search for video candidates when the user references a title or topic instead of giving a link.
  - Filter the results to the requested channel before trusting them.
- `GET /v1/metadata`
  - Pull title, description, author name, duration, publish date, thumbnail, and view count for a video URL.
- `GET /v1/transcript`
  - Pull the transcript as text.
  - The API may return `202` with a `jobId`; poll `GET /v1/transcript/{jobId}` until the status becomes `completed` or `failed`.

## Practical defaults

- Default transcript language to `en`.
  - Live testing showed Supadata may return a non-English transcript when `lang` is omitted even if English is available.
- Default transcript mode to `native` for channel sweeps or multi-video requests.
  - This avoids accidental AI-generation spend.
- Use `auto` when the user explicitly wants fallback generation for a specific video and accepts the extra credit usage.
- Avoid parallel Supadata calls unless you know the account has enough rate-limit headroom.
  - The current account can return `429 limit-exceeded` when requests are bursty.

## Cost and latency notes

- Native transcript requests cost 1 credit.
- `mode=auto` or `mode=generate` can incur AI transcription charges for videos without native captions.
- Transcript status polling does not consume credits.
- Channel/video metadata and search calls also consume credits, so keep candidate searches tight.

## Recommended resolution strategy

1. If the user gives one or more direct video URLs, skip channel search and collect those videos directly.
2. If the user gives a channel plus a topic or title reference:
   - Resolve the channel.
   - Search with a query like `"{channel name} {user reference}"`.
   - Keep only search hits from that exact channel.
   - If multiple candidates remain, either summarize the top few or ask the user which one they meant.
3. If the user asks for the latest videos from a channel:
   - Use the channel videos endpoint.
   - Default to `video` rather than `all` unless they explicitly ask for Shorts or live uploads.

## Helper script examples

```bash
# Resolve likely matches without spending transcript credits
python3 scripts/supadata_youtube.py resolve \
  --channel https://youtube.com/@RickAstleyVEVO \
  --query "never gonna give you up" \
  --limit 3

# Collect the latest two standard uploads from a channel
python3 scripts/supadata_youtube.py collect \
  --channel https://youtube.com/@RickAstleyVEVO \
  --limit 2 \
  --lang en \
  --mode native

# Collect a direct video URL and allow AI fallback if native captions are missing
python3 scripts/supadata_youtube.py collect \
  --video-url https://www.youtube.com/watch?v=dQw4w9WgXcQ \
  --lang en \
  --mode auto
```
