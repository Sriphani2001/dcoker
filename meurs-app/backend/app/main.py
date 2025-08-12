# app/main.py
from fastapi import FastAPI, Depends, HTTPException, APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pathlib import Path
from . import models, schemas
from .database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)
app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
MEDIA_DIR = BASE_DIR.parent / "media"
FRONTEND_PUBLIC_DIR = BASE_DIR / "frontend" / "public"
FRONTEND_BUILD_DIR = BASE_DIR / "frontend" / "build"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000","http://127.0.0.1:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

api = APIRouter(prefix="/api")

@api.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    new_user = models.User(username=user.username, password=user.password)  # TODO: hash later
    db.add(new_user); db.commit(); db.refresh(new_user)
    return {"message": "User created successfully"}

@api.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "username": db_user.username}

@api.get("/music")
def get_music_list():
    p = MEDIA_DIR / "music"; p.mkdir(parents=True, exist_ok=True)
    return {"music": [f.name for f in p.iterdir() if f.is_file()]}

@api.get("/videos")
def get_video_list():
    p = MEDIA_DIR / "videos"; p.mkdir(parents=True, exist_ok=True)
    return {"videos": [f.name for f in p.iterdir() if f.is_file()]}

app.include_router(api)

# Static mounts AFTER the API routes is fine, but with /api prefix order no longer matters.
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(MEDIA_DIR)), name="static")

# Serve frontend at root
if FRONTEND_BUILD_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_BUILD_DIR), html=True), name="frontend")
elif FRONTEND_PUBLIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_PUBLIC_DIR), html=True), name="frontend")
