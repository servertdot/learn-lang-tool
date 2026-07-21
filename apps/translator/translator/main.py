from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from threading import Lock
from typing import Annotated

import argostranslate.translate
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: Annotated[
        str,
        Field(
            min_length=1,
            max_length=10_000,
            description="Text to translate",
        ),
    ]
    from_code: Annotated[
        str,
        Field(
            min_length=2,
            max_length=10,
            description="Source language code",
        ),
    ] = "en"
    to_code: Annotated[
        str,
        Field(
            min_length=2,
            max_length=10,
            description="Target language code",
        ),
    ] = "ru"


class TranslateResponse(BaseModel):
    source_text: str
    translated_text: str
    from_code: str
    to_code: str


class HealthResponse(BaseModel):
    status: str


class TranslatorService:
    def __init__(self) -> None:
        # На первое время блокируем параллельные вызовы модели.
        # Так безопаснее, пока не проверили её поведение под нагрузкой.
        self._lock = Lock()

    def translate(
        self,
        text: str,
        from_code: str,
        to_code: str,
    ) -> str:
        translator = argostranslate.translate.get_translation_from_codes(
            from_code,
            to_code,
        )

        if translator is None:
            raise ValueError(
                f"Model {from_code} → {to_code} is not installed. "
                "Run: pnpm --filter @app/translator run models:install"
            )

        with self._lock:
            return translator.translate(text)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    service = TranslatorService()

    # Проверяем модель при запуске, чтобы сервис не стартовал
    # в формально рабочем, но бесполезном состоянии.
    translator = argostranslate.translate.get_translation_from_codes(
        "en",
        "ru",
    )

    if translator is None:
        raise RuntimeError(
            "Model en → ru is not installed. "
            "Run: pnpm --filter @app/translator run models:install"
        )

    app.state.translator_service = service

    yield


app = FastAPI(
    title="Translator Service",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/translate", response_model=TranslateResponse)
def translate(
    body: TranslateRequest,
    request: Request,
) -> TranslateResponse:
    service: TranslatorService = request.app.state.translator_service

    try:
        translated_text = service.translate(
            text=body.text,
            from_code=body.from_code,
            to_code=body.to_code,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail="Translation failed",
        ) from error

    return TranslateResponse(
        source_text=body.text,
        translated_text=translated_text,
        from_code=body.from_code,
        to_code=body.to_code,
    )
