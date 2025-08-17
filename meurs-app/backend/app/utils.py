import secrets
from pathlib import Path
from urllib.parse import urlparse

# --- IDs ---
ALLOWED_CHARS = "abcdefghijklmnopqrstuvwxyz123456789!@#$%&*"

def gen_room_id(length: int = 7) -> str:
    return "".join(secrets.choice(ALLOWED_CHARS) for _ in range(length))

# --- Filesystem helpers ---
def ensure_dir(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p

def list_files(dirpath: Path) -> list[str]:
    ensure_dir(dirpath)
    return [f.name for f in dirpath.iterdir() if f.is_file()]

# --- Proxy host allowlist ---
ALLOWED_PROXY_HOSTS = {
    "pixabay.com", "cdn.pixabay.com",
    "audius.co", "discoveryprovider.audius.co", "content-node.audius.co",
    "cdn.audius.co", "audius-prod-*.audius.co",
    "archive.org", "ia802*.us.archive.org", "ia903*.us.archive.org",
    "images.pexels.com", "videos.pexels.com", "player.pexels.com"
}

def host_allowed(url: str) -> bool:
    try:
        h = urlparse(url).hostname or ""
    except Exception:
        return False
    for entry in ALLOWED_PROXY_HOSTS:
        if "*" in entry:
            prefix, suffix = entry.split("*", 1)
            if h.startswith(prefix) and h.endswith(suffix):
                return True
        elif h == entry:
            return True
    return False
