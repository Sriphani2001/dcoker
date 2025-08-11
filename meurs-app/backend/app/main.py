from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.staticfiles import StaticFiles
from . import models, schemas
from .database import SessionLocal, engine
import os
from fastapi.responses import FileResponse
import os

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "../frontend/public")

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# Serve static files (music/videos)
BASE_DIR = os.path.dirname(__file__)
MEDIA_DIR = os.path.join(BASE_DIR, "../media")
app.mount("/static", StaticFiles(directory=MEDIA_DIR), name="static")


@app.get("/")
def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
 
def get_db():
    db = SessionLocal()
    try:

        yield db
    finally:
        db.close()

@app.get("/music")
def get_music_list():
    music_dir = os.path.join(MEDIA_DIR, "music")
    files = os.listdir(music_dir)
    return {"music": files}

@app.get("/videos")
def get_video_list():
    video_dir = os.path.join(MEDIA_DIR, "videos")
    files = os.listdir(video_dir)
    return {"videos": files}        

@app.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    new_user = models.User(username=user.username, password=user.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User created successfully"}

@app.post("/login")
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=400, detail="Invalid credentials")
    return {"message": "Login successful", "username": db_user.username}


