from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .settings import settings
from .database import engine
from .models import Base
from .api import router as api_router
from .ws import comuni_ws

# NEW: import the survival RPG router (file sits alongside main.py)
from .rpg_survival_routes import router as survival_router

# NEW: LLM diagnostics
from .rpg_llm import llm_diagnostics

# --- Routers ---------------------------------------------------------------
# Regular API router is already included with prefix="/api" below.
# Create a small router for LLM diagnostics and give it the same "/api" prefix.
llm_router = APIRouter(prefix="/api")

@llm_router.get("/llm/test")
async def llm_test():
    return await llm_diagnostics()

# --- Paths -----------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR.parent / "media"
FRONTEND_PUBLIC_DIR = BASE_DIR / "frontend" / "public"
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"


def create_app() -> FastAPI:
    Base.metadata.create_all(bind=engine)

    app = FastAPI()

    # ---- CORS --------------------------------------------------------------
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
        # keep these so the range-proxy media endpoints work well
        expose_headers=["Content-Range", "Accept-Ranges"],
    )

    # ---- API & WS ----------------------------------------------------------
    app.include_router(api_router, prefix="/api")
    app.include_router(survival_router)     # adds /api/rpg/survival endpoints (router has its own prefix)
    app.include_router(llm_router)          # <--- NEW: /api/llm/test
    app.add_api_websocket_route("/ws/comuni/{room_id}", comuni_ws)

    # ---- Static mounts -----------------------------------------------------
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(MEDIA_DIR)), name="static")

    # Serve frontend (build first; fallback to public)
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
