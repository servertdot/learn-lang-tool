# Learn Lang Tool

Браузерное расширение для изучения английского: выделяешь текст на странице, получаешь перевод и при необходимости сохраняешь фразу в Anki как карточку.

Цель — учить не только отдельные слова, а целые словосочетания и фразы в том контексте, где ты их встретил.

## Зачем это нужно

Типичный словарь или flashcard-приложение заставляет вырывать слова из контекста. Здесь поток другой: читаешь что угодно в браузере → выделяешь интересный кусок → сразу видишь перевод → при желании отправляешь в Anki.

Так проще запоминать устойчивые выражения, коллокации и целые предложения, а не только изолированные леммы.

## Связь с Yomitan

Проект в каком-то смысле — альтернатива [Yomitan](https://github.com/yomidevs/yomitan) ([документация](https://yomitan.wiki/)).

Yomitan — мощное расширение для language learning: popup-словари, частоты, аудио, экспорт в Anki. Оно опирается на загруженные словари и отлично работает для поиска слов (особенно для японского и других языков с сильной словарной экосистемой).

Мы хотим похожий UX «перевод прямо на странице + сохранение в Anki», но с акцентом на **перевод фраз и словосочетаний**, а не только словарный lookup отдельных слов. Перевод идёт через собственный backend с машинным переводчиком, а не через локальные словарные пакеты.

| | Yomitan | Learn Lang Tool |
|---|---|---|
| Источник смысла | Локальные словари | Машинный перевод фраз |
| Сильная сторона | Lookup слова, богатые словарные данные | Перевод словосочетаний и предложений |
| Anki | Зрелая интеграция | Планируется / в разработке |
| Фокус | Много языков (в т.ч. японский) | В первую очередь английский → русский |

## Как это работает

1. На странице выделяешь текст (слово, фразу или предложение) или держишь hotkey над словом.
2. Content script расширения показывает **translation popover** рядом с выделением.
3. Запрос уходит в API (`POST /translate`).
4. API проксирует перевод в сервис translator (Argos Translate).
5. В popover появляются оригинал и перевод; если результат Anki-eligible — можно добавить карточку.

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│  Extension      │────▶│  API         │────▶│  Translator    │
│  (content UI)   │     │  (Fastify)   │     │  (FastAPI +    │
│                 │◀────│  :3000       │◀────│   Argos) :8000 │
└────────┬────────┘     └──────────────┘     └────────────────┘
         │
         ▼
   Anki (карточки)  ← в планах / интеграции
```

## Монорепа

Репозиторий — **pnpm workspace** (`apps/*`, `packages/*`). Общие типы и константы живут в одном месте, приложения зависят друг от друга через `workspace:`.

```
learn-lang-tool/
├── apps/
│   ├── extension/   # Chrome/Firefox расширение (React + Vite + Tailwind)
│   ├── api/         # Fastify BFF: /health, /translate
│   └── translator/  # FastAPI + Argos Translate (локальный MT)
└── packages/
    └── shared/      # Общие типы (TranslateRequest/Response), дефолты, API_BASE_URL
```

### `apps/extension`

Content script на странице: selection / hold-to-translate, popover с переводом, настройки языковой пары (`en → ru` по умолчанию). Собирается через Vite (`@crxjs/vite-plugin`), есть сборки под Chrome и Firefox.

### `apps/api`

Тонкий backend на Fastify. Принимает запросы от расширения, валидирует тело, ходит в translator и возвращает единый контракт ответа (включая флаг `can_add_to_anki`).

### `apps/translator`

Отдельный Python-сервис на FastAPI. Делает машинный перевод через Argos Translate. API не знает деталей модели — только HTTP-клиент к этому сервису.

### `packages/shared`

Общий контракт между extension и API: `TranslateRequest`, `TranslateResponse`, `LanguagePair`, `DEFAULT_HOTKEY`, `API_BASE_URL`.

## Локальный запуск

Нужны Node.js, [pnpm](https://pnpm.io/) и Poetry (для translator).

```bash
pnpm install

# модели для Argos (один раз)
pnpm --filter @app/translator models:install

# все dev-сервисы параллельно (extension + api + translator)
pnpm dev
```

Или по отдельности:

```bash
pnpm --filter @app/translator dev   # :8000
pnpm --filter @app/api dev          # :3000
pnpm --filter @app/extension dev    # Vite + hot reload расширения
```

После старта extension загрузи unpacked-сборку в Chrome/Firefox из выходной директории Vite (см. `apps/extension`).

## Стек

- **Extension:** React 19, TypeScript, Vite, Tailwind CSS, Manifest V3
- **API:** Fastify, TypeScript
- **Translator:** FastAPI, Argos Translate, Poetry
- **Монорепа:** pnpm workspaces
