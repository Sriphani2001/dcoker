from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .settings import settings
from .database import engine
from .models import Base
from .api import router as api_router
from .ws import comuni_ws

BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR.parent / "media"
FRONTEND_PUBLIC_DIR = BASE_DIR / "frontend" / "public"
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"

def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)

    app = FastAPI()

    # CORS
    default_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins = (
        [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
        if settings.CORS_ORIGINS else default_origins
    )
    app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges"],  # add this
)

    # API & WS
    app.include_router(api_router, prefix="/api")
    app.add_api_websocket_route("/ws/comuni/{room_id}", comuni_ws)

    # Static mounts
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(MEDIA_DIR)), name="static")

    if FRONTEND_BUILD_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(FRONTEND_BUILD_DIR), html=True), name="frontend")
    elif FRONTEND_PUBLIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=str(FRONTEND_PUBLIC_DIR), html=True), name="frontend")
    else:
        @app.get("/")
        def root():
            return {"message": "Put index.html in app/frontend/public or build to app/frontend/build"}

    return app

app = create_app()
