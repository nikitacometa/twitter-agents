"""Environment-driven service configuration."""

from pathlib import Path
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    db_path: Path = Field(default=Path("data/retrieval.db"), validation_alias="RETRIEVAL_DB_PATH")
    embedder: Literal["openai", "hash"] = Field(default="hash", validation_alias="EMBEDDER")
    openai_api_key: SecretStr | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    embedding_model: str = Field(
        default="text-embedding-3-small", validation_alias="EMBEDDING_MODEL"
    )
    qdrant_url: str | None = Field(default=None, validation_alias="QDRANT_URL")

    @model_validator(mode="after")
    def validate_embedder_credentials(self) -> Self:
        if self.embedder == "openai" and self.openai_api_key is None:
            raise ValueError("OPENAI_API_KEY is required when EMBEDDER=openai")
        return self

