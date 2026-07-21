# Learn Lang Tool

Браузерное расширение для изучения английского: выделяешь текст на странице, получаешь перевод и при необходимости сохраняешь фразу в Anki как карточку.

Цель — учить не только отдельные слова, а целые словосочетания и фразы в том контексте, где ты их встретил.

## Зачем это нужно

Типичный словарь или flashcard-приложение заставляет вырывать слова из контекста. Здесь поток другой: читаешь что угодно в браузере → выделяешь интересный кусок → сразу видишь перевод → при желании отправляешь в Anki.

Так проще запоминать устойчивые выражения, коллокации и целые предложения, а не только изолированные леммы.

## Связь с Yomitan

Проект в каком-то смысле — альтернатива [Yomitan](https://github.com/yomidevs/yomitan) ([документация](https://yomitan.wiki/)).

Yomitan — мощное расширение для language learning: popup-словари, частоты, аудио, экспорт в Anki. Оно опирается на загруженные словари и отлично работает для поиска слов.

Мы хотим похожий UX «перевод прямо на странице + сохранение в Anki», но с акцентом на **перевод фраз и словосочетаний**. По умолчанию расширение обращается напрямую к Google Translate ради качества; в Options можно выбрать полностью локальный Bergamot (Marian WASM).

| | Yomitan | Learn Lang Tool |
|---|---|---|
| Источник смысла | Локальные словари | Google Translate или локальный Bergamot для фраз |
| Сильная сторона | Lookup слова, богатые словарные данные | Перевод словосочетаний и предложений |
| Anki | Зрелая интеграция | Добавление карточки через AnkiConnect |
| Инфра для пользователя | Не нужна | Свой сервер не нужен; для карточек нужен запущенный Anki с AnkiConnect |

## Как это работает (product path)

1. На странице выделяешь текст или держишь hotkey над словом.
2. Content script показывает **translation popover**.
3. Запрос уходит в **translation facade** → background, где выбирается сохранённый provider.
4. По умолчанию текст отправляется напрямую на фиксированный `https://translate.google.com` через минимальный адаптер без npm-зависимостей.
5. Для приватного режима можно выбрать Bergamot и скачать model pack языковой пары (v1: `en → ru`); тогда перевод работает offline и выделенный текст не покидает устройство.
6. Кнопка **Add to Anki** отправляет исходный текст, перевод и контекстное предложение в локальный AnkiConnect; после добавления **View in Anki** открывает созданную заметку в Browse.

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Extension UI   │────▶│  Background      │────▶│  Google Translate  │
│  (popover)      │     │  provider router │     └────────────────────┘
│                 │◀────│                  │────▶ Offscreen / Bergamot
└─────────────────┘     └──────────────────┘
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

Загрузи unpacked-сборку Chrome из выходной директории Vite (`dist_chrome`). Google выбран по умолчанию. Для offline-режима выбери Bergamot в Options и скачай model pack `en→ru` (~15 MB). Оба режима работают без `api`/`translator`.

Для добавления карточек установи AnkiConnect, запусти Anki и подготовь колоду `English` с типом заметки `Basic (and reversed card)` и полями `Word`, `Reading`, `Sentence`, `Meaning`. По умолчанию расширение подключается к `http://127.0.0.1:8765` и добавляет тег `yomitan`. При первом добавлении AnkiConnect попросит разрешить доступ расширению.

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

HTTP-адаптер в коде сохранён, но текущий product router предлагает Google и Bergamot.

## Стек

- **Extension:** React 19, TypeScript, Vite, Tailwind CSS, Manifest V3, Bergamot WASM
- **Optional API:** Fastify, TypeScript
- **Optional Translator:** FastAPI, Argos Translate, Poetry
- **Монорепа:** pnpm workspaces

## Документы

- [`CONTEXT.md`](CONTEXT.md) — доменный глоссарий
- [`docs/adr/0001-bergamot-as-translation-engine.md`](docs/adr/0001-bergamot-as-translation-engine.md) — исходное local-first решение
- [`docs/adr/0002-google-quality-provider.md`](docs/adr/0002-google-quality-provider.md) — Google по умолчанию и Bergamot как offline-режим
