from pydantic import computed_field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application-wide configuration. Override via environment variables."""

    app_name: str = "AegisGraph AI"
    api_version: str = "2.0.0"

    # Authentication
    jwt_secret_key: str = "aegis_super_secret_key_that_should_be_changed_in_prod"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440 # 24 hours


    # PostgreSQL Relational Database
    postgres_user: str = "aegis"
    postgres_password: str = "aegis_pass"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "aegisgraph"

    @computed_field
    @property
    def async_database_uri(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # SQLAlchemy Pool Configuration
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 1800

    # Local AI Inference
    ollama_model: str = "llama3"
    ollama_num_gpu: int = 0

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = (".env", "../.env")


settings = Settings()
