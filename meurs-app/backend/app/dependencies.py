from sqlalchemy.orm import Session
from .database import SessionLocal
from .settings import settings

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_settings():
    return settings
