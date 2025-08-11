from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)

    playlists = relationship("Playlist", back_populates="owner")

class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    media_type = Column(String)  # "music" or "video"
    owner_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="playlists")
