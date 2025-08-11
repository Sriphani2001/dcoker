from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class PlaylistCreate(BaseModel):
    name: str
    media_type: str
