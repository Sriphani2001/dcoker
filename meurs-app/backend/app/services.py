import httpx
import asyncio
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask
from urllib.parse import urlencode
from .settings import settings

# ---- Audius ----
async def audius_search_tracks(q: str, limit: int, offset: int):
    async with httpx.AsyncClient(timeout=15) as client:
        host_resp = await client.get("https://api.audius.co")
        host_resp.raise_for_status()
        host = host_resp.json()["data"][0]
        r = await client.get(
            f"{host}/v1/tracks/search",
            params={"query": q, "limit": limit, "offset": offset},
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def audius_resolve_stream(track_id: str) -> str:
    """
    Ask the Audius discovery provider for the stream URL.
    Audius typically returns a 302 with the CDN URL in Location.
    We do NOT follow redirects here; we surface the final URL.
    """
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        host_resp = await client.get("https://api.audius.co")
        host_resp.raise_for_status()
        host = host_resp.json()["data"][0]

        resp = await client.get(
            f"{host}/v1/tracks/{track_id}/stream",
            follow_redirects=False,
        )

        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get("location")
            if not loc:
                raise HTTPException(502, "Audius redirect missing Location")
            return str(loc)

        if resp.status_code == 200:
            # Some providers might directly serve the stream
            return str(resp.url)

        # Surface other errors with a helpful message
        try:
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            detail = e.response.text[:200] if e.response is not None else str(e)
            raise HTTPException(e.response.status_code if e.response else 502,
                                f"Audius error: {detail}")


# ---- Pixabay ----
async def pixabay_video_search(q: str, page: int, per_page: int):
    if not settings.PIXABAY_KEY:
        raise HTTPException(500, "Pixabay key not configured")
    params = {
        "key": settings.PIXABAY_KEY,
        "q": q,
        "page": page,
        "per_page": min(max(per_page, 1), 50),
        "video_type": "all",
        "safesearch": "true",
    }
    url = "https://pixabay.com/api/videos/?" + urlencode(params)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.json()


# ---- Range proxy core ----
async def range_proxy(request: Request, target_url: str):
    # Forward the Range header if present (audio seeks)
    fwd_headers = {}
    if rng := request.headers.get("range"):
        fwd_headers["Range"] = rng

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)

    # Build & send as a streamed request (do NOT use 'async with client.stream(...)' here)
    req = client.build_request("GET", target_url, headers=fwd_headers)
    upstream = await client.send(req, stream=True)

    # Pass through the most important headers/status for media playback
    passthrough = (
        "content-type", "content-range", "accept-ranges",
        "content-length", "etag", "last-modified", "cache-control",
        "content-disposition",
    )
    out_headers = {h: upstream.headers[h] for h in passthrough if h in upstream.headers}
    status = upstream.status_code

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                # Optionally guard against empty heartbeats:
                if not chunk:
                    continue
                yield chunk
        except (httpx.StreamClosed, asyncio.CancelledError):
            # Upstream closed early or client went away; stop quietly.
            return
        finally:
            # Always close network resources
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(body(), status_code=status, headers=out_headers)