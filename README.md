# Learn Lang Tool

Браузерное расширение для изучения английского: выделяешь текст на странице, получаешь перевод и при необходимости сохраняешь фразу в Anki как карточку.

Цель — учить не только отдельные слова, а целые словосочетания и фразы в том контексте, где ты их встретил.

## Зачем это нужно

Типичный словарь или flashcard-приложение заставляет вырывать слова из контекста. Здесь поток другой: читаешь что угодно в браузере → выделяешь интересный кусок → сразу видишь перевод → при желании отправляешь в Anki.

Так проще запоминать устойчивые выражения, коллокации и целые предложения, а не только изолированные леммы.

## Связь с Yomitan

Проект в каком-то смысле — альтернатива [Yomitan](https://github.com/yomidevs/yomitan) ([документация](https://yomitan.wiki/)).

Yomitan — мощное расширение для language learning: popup-словари, частоты, аудио, экспорт в Anki. Оно опирается на загруженные словари и отлично работает для поиска слов.

Мы хотим похожий UX «перевод прямо на странице + сохранение в Anki», но с акцентом на **перевод фраз и словосочетаний**. Product-path перевод идёт **локально в расширении** через Bergamot (Marian WASM), а не через обязательный удалённый сервер.

| | Yomitan | Learn Lang Tool |
|---|---|---|
| Источник смысла | Локальные словари | Локальный MT (Bergamot) для фраз |
| Сильная сторона | Lookup слова, богатые словарные данные | Перевод словосочетаний и предложений |
| Anki | Зрелая интеграция | Отдельный трек |
| Инфра для пользователя | Не нужна | Не нужна после скачивания model pack |

## Как это работает (product path)

1. На странице выделяешь текст или держишь hotkey над словом.
2. Content script показывает **translation popover**.
3. Запрос уходит в **translation facade** → background → offscreen **translation engine** (Bergamot).
4. Нужен скачанный **model pack** для языковой пары (v1: `en → ru`) — с явным согласием в Options / CTA в popover.
5. После установки pack перевод работает **offline**. Текст со страницы никуда не уходит.

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│  Extension UI   │────▶│  Background  │────▶│  Offscreen     │
│  (popover)      │     │  + model pack│     │  Bergamot WASM │
│                 │◀────│    status    │◀────│  + Cache API   │
└─────────────────┘     └──────────────┘     └────────────────┘
```

`apps/api` + `apps/translator` остаются в монорепе как **optional translation backend** для разработки/экспериментов и **не нужны** для happy path расширения.

## Монорепа

```
learn-lang-tool/
├── apps/
│   ├── extension/   # Chrome MV3 расширение (React + Vite + Tailwind + Bergamot)
│   ├── api/         # Optional Fastify BFF (не обязателен для product path)
│   └── translator/  # Optional FastAPI + Argos (не обязателен для product path)
└── packages/
    └── shared/      # TranslateRequest/Response, language pair defaults, limits
```

## Локальный запуск (расширение)

```bash
pnpm install
pnpm --filter @app/extension dev
```

Загрузи unpacked-сборку Chrome из выходной директории Vite (`dist_chrome`). В Options скачай model pack `en→ru` (~15 MB). После этого перевод работает без `api`/`translator`.

Тесты / проверка типов:

```bash
pnpm --filter @app/extension test
pnpm --filter @app/extension typecheck
pnpm --filter @app/extension lint
```

### Optional backend (необязательно)

```bash
pnpm --filter @app/translator models:install
pnpm --filter @app/translator dev   # :8000
pnpm --filter @app/api dev          # :3000
```

HTTP-адаптер в коде сохранён, но product facade использует локальный engine.

## Стек

- **Extension:** React 19, TypeScript, Vite, Tailwind CSS, Manifest V3, Bergamot WASM
- **Optional API:** Fastify, TypeScript
- **Optional Translator:** FastAPI, Argos Translate, Poetry
- **Монорепа:** pnpm workspaces

## Документы

- [`CONTEXT.md`](CONTEXT.md) — доменный глоссарий
- [`docs/adr/0001-bergamot-as-translation-engine.md`](docs/adr/0001-bergamot-as-translation-engine.md) — решение про Bergamot
