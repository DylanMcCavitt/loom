#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import json
import math
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://api.supadata.ai/v1"
DEFAULT_POLL_INTERVAL = 1.5
DEFAULT_POLL_TIMEOUT = 180.0
DEFAULT_REQUEST_SPACING = 0.7
DEFAULT_LANG = "en"


class SupadataError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload or {}
        self.headers = headers or {}

    def to_dict(self) -> dict[str, Any]:
        result = {"message": str(self)}
        if self.status is not None:
            result["status"] = self.status
        if self.payload:
            result["payload"] = self.payload
        retry_after = self.headers.get("retry-after")
        if retry_after:
            result["retryAfter"] = retry_after
        return result


def load_api_key() -> str:
    env_key = os.getenv("SUPADATA_API_KEY", "").strip()
    if env_key:
        return env_key

    skill_dir = Path(__file__).resolve().parents[1]
    key_path = skill_dir / ".supadata_api_key"
    if key_path.exists():
        key = key_path.read_text(encoding="utf-8").strip()
        if key:
            return key

    raise SupadataError(
        "Missing Supadata API key. Set SUPADATA_API_KEY or create "
        f"{key_path} with the key on one line."
    )


def parse_json(raw: bytes) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise SupadataError("Supadata returned non-JSON data") from exc
    if isinstance(payload, dict):
        return payload
    raise SupadataError("Supadata returned an unexpected response shape")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def slugify(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def extract_video_id(url: str) -> str | None:
    patterns = [
        r"[?&]v=([A-Za-z0-9_-]{11})",
        r"youtu\.be/([A-Za-z0-9_-]{11})",
        r"/shorts/([A-Za-z0-9_-]{11})",
        r"/embed/([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def watch_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def build_search_queries(channel: dict[str, Any], query: str) -> list[str]:
    candidates = []
    for prefix in (channel.get("name"), channel.get("handle"), channel.get("id")):
        prefix = normalize_text(prefix)
        if prefix:
            candidates.append(f"{prefix} {query}".strip())
    candidates.append(query.strip())

    unique: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = candidate.casefold()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def score_search_result(
    query: str, result: dict[str, Any], channel: dict[str, Any]
) -> float:
    query_slug = slugify(query)
    title = result.get("title") or ""
    description = result.get("description") or ""
    haystack = f"{title} {description}"
    title_slug = slugify(title)
    haystack_slug = slugify(haystack)

    score = 0.0
    if query_slug and query_slug in title_slug:
        score += 4.0
    if query_slug and query_slug in haystack_slug:
        score += 1.5
    score += difflib.SequenceMatcher(None, query_slug, title_slug).ratio() * 3.0
    score += difflib.SequenceMatcher(None, query_slug, haystack_slug).ratio()

    query_tokens = set(query_slug.split())
    title_tokens = set(title_slug.split())
    if query_tokens:
        score += (len(query_tokens & title_tokens) / len(query_tokens)) * 3.0

    result_channel = result.get("channel") or {}
    if result_channel.get("id") and result_channel.get("id") == channel.get("id"):
        score += 5.0
    elif slugify(result_channel.get("name")) == slugify(channel.get("name")):
        score += 2.0

    view_count = result.get("viewCount")
    if isinstance(view_count, (int, float)) and view_count > 0:
        score += min(math.log10(view_count + 1), 10.0) * 0.2

    search_index = result.get("_searchIndex")
    if isinstance(search_index, int):
        score += max(0.0, 2.0 - (search_index * 0.2))

    return score


class SupadataClient:
    def __init__(
        self,
        api_key: str,
        *,
        request_spacing: float = DEFAULT_REQUEST_SPACING,
        timeout: float = 45.0,
        max_retries: int = 4,
    ) -> None:
        self.api_key = api_key
        self.request_spacing = request_spacing
        self.timeout = timeout
        self.max_retries = max_retries
        self._last_request_at = 0.0

    def _wait_for_spacing(self) -> None:
        remaining = self.request_spacing - (time.monotonic() - self._last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def _send(
        self, path: str, params: dict[str, Any] | None = None
    ) -> tuple[int, dict[str, Any], dict[str, str]]:
        url = f"{API_BASE}{path}"
        if params:
            url = f"{url}?{urlencode({k: v for k, v in params.items() if v is not None}, doseq=True)}"

        last_error: SupadataError | None = None
        for attempt in range(self.max_retries + 1):
            self._wait_for_spacing()
            self._last_request_at = time.monotonic()
            request = Request(
                url,
                headers={
                    "accept": "application/json",
                    "accept-language": "en-US,en;q=0.9",
                    "user-agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/135.0.0.0 Safari/537.36"
                    ),
                    "x-api-key": self.api_key,
                },
                method="GET",
            )

            try:
                with urlopen(request, timeout=self.timeout) as response:
                    status = response.status
                    headers = {
                        key.lower(): value for key, value in response.headers.items()
                    }
                    payload = parse_json(response.read())
            except HTTPError as exc:
                status = exc.code
                headers = {key.lower(): value for key, value in exc.headers.items()}
                payload = parse_json(exc.read())
            except URLError as exc:
                raise SupadataError(f"Supadata request failed: {exc.reason}") from exc

            if status == 429 and attempt < self.max_retries:
                retry_after = headers.get("retry-after")
                try:
                    delay = float(retry_after) if retry_after else 2.0 * (attempt + 1)
                except ValueError:
                    delay = 2.0 * (attempt + 1)
                time.sleep(max(delay, self.request_spacing))
                continue

            if status >= 400 or status == 206:
                last_error = SupadataError(
                    payload.get("message") or payload.get("error") or f"Supadata error for {path}",
                    status=status,
                    payload=payload,
                    headers=headers,
                )
                break

            return status, payload, headers

        if last_error is None:
            raise SupadataError(f"Supadata request failed for {path}")
        raise last_error

    def channel(self, channel_id: str) -> dict[str, Any]:
        _, payload, headers = self._send("/youtube/channel", {"id": channel_id})
        payload["billableRequests"] = headers.get("x-billable-requests")
        return payload

    def channel_videos(
        self, channel_id: str, *, limit: int, video_type: str
    ) -> dict[str, Any]:
        _, payload, headers = self._send(
            "/youtube/channel/videos",
            {"id": channel_id, "limit": limit, "type": video_type},
        )
        payload["billableRequests"] = headers.get("x-billable-requests")
        return payload

    def search(self, query: str, *, limit: int, sort_by: str) -> dict[str, Any]:
        _, payload, headers = self._send(
            "/youtube/search",
            {"query": query, "type": "video", "limit": limit, "sortBy": sort_by},
        )
        payload["billableRequests"] = headers.get("x-billable-requests")
        return payload

    def metadata(self, url: str) -> dict[str, Any]:
        _, payload, headers = self._send("/metadata", {"url": url})
        payload["billableRequests"] = headers.get("x-billable-requests")
        return payload

    def transcript(
        self,
        url: str,
        *,
        lang: str,
        mode: str,
        poll_interval: float,
        poll_timeout: float,
    ) -> dict[str, Any]:
        status, payload, headers = self._send(
            "/transcript",
            {"url": url, "lang": lang, "text": "true", "mode": mode},
        )

        if status == 202 or payload.get("jobId"):
            job_id = payload.get("jobId")
            if not job_id:
                raise SupadataError("Supadata returned 202 without a jobId")
            result = self.poll_transcript_job(
                job_id, poll_interval=poll_interval, poll_timeout=poll_timeout
            )
            result["jobId"] = job_id
            result["requestedMode"] = mode
            result["billableRequests"] = headers.get("x-billable-requests")
            return result

        payload["requestedMode"] = mode
        payload["billableRequests"] = headers.get("x-billable-requests")
        return payload

    def poll_transcript_job(
        self, job_id: str, *, poll_interval: float, poll_timeout: float
    ) -> dict[str, Any]:
        deadline = time.monotonic() + poll_timeout
        last_status = "queued"
        while time.monotonic() < deadline:
            _, payload, _headers = self._send(f"/transcript/{job_id}")
            last_status = payload.get("status") or last_status
            if last_status == "completed":
                return payload
            if last_status == "failed":
                error_payload = payload.get("error") or payload
                raise SupadataError(
                    error_payload.get("message") or "Transcript job failed",
                    status=500,
                    payload=error_payload,
                )
            time.sleep(poll_interval)

        raise SupadataError(
            f"Transcript job {job_id} timed out after {poll_timeout:.0f}s",
            payload={"status": last_status},
        )


def flatten_video_ids(payload: dict[str, Any], video_type: str, limit: int) -> list[str]:
    if video_type == "video":
        candidates = payload.get("videoIds") or []
    elif video_type == "short":
        candidates = payload.get("shortIds") or []
    elif video_type == "live":
        candidates = payload.get("liveIds") or []
    else:
        candidates = (
            (payload.get("videoIds") or [])
            + (payload.get("shortIds") or [])
            + (payload.get("liveIds") or [])
        )
    return candidates[:limit]


def resolve_targets(
    client: SupadataClient, args: argparse.Namespace
) -> tuple[dict[str, Any] | None, list[dict[str, Any]], list[str]]:
    warnings: list[str] = []

    if args.video_url:
        return (
            None,
            [
                {
                    "selectionSource": "direct-url",
                    "url": url,
                    "videoId": extract_video_id(url),
                }
                for url in args.video_url
            ],
            warnings,
        )

    if not args.channel:
        raise SupadataError("Provide either --video-url or --channel.")

    channel = client.channel(args.channel)

    if args.query:
        matches: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for search_query in build_search_queries(channel, args.query):
            payload = client.search(search_query, limit=args.search_limit, sort_by=args.sort_by)
            for index, result in enumerate(payload.get("results") or []):
                if result.get("type") != "video":
                    continue
                result_channel = result.get("channel") or {}
                same_channel = (
                    result_channel.get("id") == channel.get("id")
                    or slugify(result_channel.get("name")) == slugify(channel.get("name"))
                )
                if not same_channel:
                    continue
                video_id = result.get("id")
                if not video_id or video_id in seen_ids:
                    continue
                seen_ids.add(video_id)
                result["_searchQuery"] = search_query
                result["_searchIndex"] = index
                matches.append(result)
            if matches:
                break

        if not matches:
            raise SupadataError(
                f"No videos matched '{args.query}' on channel {channel.get('name') or args.channel}."
            )

        ranked = sorted(
            matches,
            key=lambda item: score_search_result(args.query, item, channel),
            reverse=True,
        )
        targets = []
        for item in ranked[: args.limit]:
            video_id = item["id"]
            targets.append(
                {
                    "selectionSource": "channel-search",
                    "selectionQuery": args.query,
                    "matchedBySearchQuery": item.get("_searchQuery"),
                    "url": watch_url(video_id),
                    "videoId": video_id,
                    "searchResult": item,
                }
            )
        return channel, targets, warnings

    payload = client.channel_videos(
        args.channel, limit=args.limit, video_type=args.video_type
    )
    video_ids = flatten_video_ids(payload, args.video_type, args.limit)
    if not video_ids:
        raise SupadataError(
            f"No {args.video_type} videos were returned for channel {channel.get('name') or args.channel}."
        )

    targets = [
        {
            "selectionSource": "channel-latest",
            "url": watch_url(video_id),
            "videoId": video_id,
        }
        for video_id in video_ids
    ]
    return channel, targets, warnings


def build_video_record(
    target: dict[str, Any],
    metadata: dict[str, Any],
    transcript: dict[str, Any] | None = None,
    transcript_error: SupadataError | None = None,
) -> dict[str, Any]:
    author = metadata.get("author") or {}
    stats = metadata.get("stats") or {}
    media = metadata.get("media") or {}
    additional_data = metadata.get("additionalData") or {}

    record: dict[str, Any] = {
        "videoId": metadata.get("id") or target.get("videoId"),
        "url": metadata.get("url") or target["url"],
        "title": metadata.get("title"),
        "description": metadata.get("description"),
        "channelName": author.get("displayName"),
        "channelId": additional_data.get("channelId"),
        "durationSeconds": media.get("duration"),
        "thumbnailUrl": media.get("thumbnailUrl"),
        "createdAt": metadata.get("createdAt"),
        "views": stats.get("views"),
        "selectionSource": target.get("selectionSource"),
        "selectionQuery": target.get("selectionQuery"),
        "matchedBySearchQuery": target.get("matchedBySearchQuery"),
        "metadataBillableRequests": metadata.get("billableRequests"),
    }

    search_result = target.get("searchResult")
    if search_result:
        record["searchResult"] = {
            "title": search_result.get("title"),
            "description": search_result.get("description"),
            "duration": search_result.get("duration"),
            "uploadDate": search_result.get("uploadDate"),
        }

    if transcript is not None:
        record["transcript"] = {
            "lang": transcript.get("lang"),
            "availableLangs": transcript.get("availableLangs"),
            "requestedMode": transcript.get("requestedMode"),
            "jobId": transcript.get("jobId"),
            "billableRequests": transcript.get("billableRequests"),
            "content": transcript.get("content"),
        }

    if transcript_error is not None:
        record["transcriptError"] = transcript_error.to_dict()

    return record


def collect_payload(
    client: SupadataClient, args: argparse.Namespace
) -> dict[str, Any]:
    channel, targets, warnings = resolve_targets(client, args)

    videos: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for target in targets:
        try:
            metadata = client.metadata(target["url"])
        except SupadataError as exc:
            errors.append(
                {
                    "url": target["url"],
                    "videoId": target.get("videoId"),
                    "stage": "metadata",
                    "error": exc.to_dict(),
                }
            )
            continue

        if args.command == "resolve":
            videos.append(build_video_record(target, metadata))
            continue

        transcript_payload: dict[str, Any] | None = None
        transcript_error: SupadataError | None = None
        try:
            transcript_payload = client.transcript(
                target["url"],
                lang=args.lang,
                mode=args.mode,
                poll_interval=args.poll_interval,
                poll_timeout=args.poll_timeout,
            )
        except SupadataError as exc:
            transcript_error = exc

        videos.append(
            build_video_record(
                target,
                metadata,
                transcript=transcript_payload,
                transcript_error=transcript_error,
            )
        )

    if not videos:
        raise SupadataError(
            "No videos were collected successfully.",
            payload={"warnings": warnings, "errors": errors},
        )

    return {
        "request": {
            "command": args.command,
            "channel": args.channel,
            "query": args.query,
            "videoUrls": args.video_url or [],
            "limit": args.limit,
            "videoType": args.video_type,
            "lang": args.lang if args.command == "collect" else None,
            "mode": args.mode if args.command == "collect" else None,
        },
        "channel": channel,
        "videos": videos,
        "warnings": warnings,
        "errors": errors,
    }


def write_output(payload: dict[str, Any], output_path: str | None) -> None:
    rendered = json.dumps(payload, indent=2, ensure_ascii=False)
    if output_path:
        path = Path(output_path).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered + "\n", encoding="utf-8")
        print(str(path))
        return
    print(rendered)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Resolve YouTube videos from a direct URL or channel reference and fetch transcripts via Supadata."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_common_arguments(target: argparse.ArgumentParser) -> None:
        target.add_argument(
            "--video-url",
            action="append",
            help="Direct YouTube video URL. Repeat for multiple videos.",
        )
        target.add_argument("--channel", help="YouTube channel URL, handle, or channel ID.")
        target.add_argument(
            "--query",
            help="Natural-language video reference to find within the channel.",
        )
        target.add_argument(
            "--limit",
            type=int,
            default=3,
            help="Maximum number of videos to resolve.",
        )
        target.add_argument(
            "--video-type",
            choices=["video", "short", "live", "all"],
            default="video",
            help="Which channel tab to use when listing latest videos.",
        )
        target.add_argument(
            "--search-limit",
            type=int,
            default=8,
            help="How many Supadata search results to inspect when --query is used.",
        )
        target.add_argument(
            "--sort-by",
            choices=["relevance", "rating", "date", "views"],
            default="relevance",
            help="Supadata search sort order when --query is used.",
        )
        target.add_argument(
            "--request-spacing",
            type=float,
            default=DEFAULT_REQUEST_SPACING,
            help="Minimum spacing between Supadata requests in seconds.",
        )
        target.add_argument(
            "--write-json",
            help="Write JSON to a file and print the path instead of the full payload.",
        )

    resolve_parser = subparsers.add_parser(
        "resolve", help="Resolve likely video matches without pulling transcripts."
    )
    add_common_arguments(resolve_parser)

    collect_parser = subparsers.add_parser(
        "collect", help="Resolve videos and pull transcripts."
    )
    add_common_arguments(collect_parser)
    collect_parser.add_argument(
        "--lang",
        default=DEFAULT_LANG,
        help="Preferred transcript language. Default: en.",
    )
    collect_parser.add_argument(
        "--mode",
        choices=["native", "auto", "generate"],
        default="native",
        help="Supadata transcript mode. Default: native.",
    )
    collect_parser.add_argument(
        "--poll-interval",
        type=float,
        default=DEFAULT_POLL_INTERVAL,
        help="Polling interval for async transcript jobs in seconds.",
    )
    collect_parser.add_argument(
        "--poll-timeout",
        type=float,
        default=DEFAULT_POLL_TIMEOUT,
        help="Timeout for async transcript jobs in seconds.",
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not args.video_url and not args.channel:
        parser.error("provide at least one --video-url or --channel")

    client = SupadataClient(load_api_key(), request_spacing=args.request_spacing)

    try:
        payload = collect_payload(client, args)
        write_output(payload, args.write_json)
        return 0
    except SupadataError as exc:
        print(json.dumps({"error": exc.to_dict()}, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
