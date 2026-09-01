from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    allowed_origins: str = "https://evazmelk.ir,https://www.evazmelk.ir"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
