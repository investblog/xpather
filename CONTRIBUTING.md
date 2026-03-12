# Contributing to Xpather

Thank you for your interest in contributing! This project is developed in response to community requests from [ZennoLab forum](https://zenno.club/discussion/threads/rasshirenie-dlja-poiska-xpath-puti.131812/).

## How to contribute

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-change`
3. Make your changes
4. Run checks: `npm run check` (typecheck + lint + test)
5. Commit and push
6. Open a Pull Request

## Development setup

```bash
git clone https://github.com/investblog/xpather.git
cd xpather
npm install
npm run dev          # Chrome dev server with HMR
npm run dev:firefox  # Firefox dev server
```

## Quality gate

All PRs must pass:

- `npm run typecheck` — TypeScript strict mode
- `npm run lint` — Biome lint + format
- `npm run test` — Vitest unit tests
- `npm run build:all` — builds for all browsers

CI runs these automatically on every push and PR.

## Feature requests and bug reports

Please use [GitHub Issues](https://github.com/investblog/xpather/issues) or discuss in the [ZennoLab thread](https://zenno.club/discussion/threads/rasshirenie-dlja-poiska-xpath-puti.131812/).

---

# Участие в разработке Xpather

Спасибо за интерес к проекту! Расширение разрабатывается по запросам сообщества [ZennoLab](https://zenno.club/discussion/threads/rasshirenie-dlja-poiska-xpath-puti.131812/).

## Как участвовать

1. Форкните репозиторий
2. Создайте ветку: `git checkout -b feature/my-change`
3. Внесите изменения
4. Запустите проверки: `npm run check` (типы + линт + тесты)
5. Закоммитьте и запушьте
6. Откройте Pull Request

## Настройка окружения

```bash
git clone https://github.com/investblog/xpather.git
cd xpather
npm install
npm run dev          # Chrome dev-сервер с HMR
npm run dev:firefox  # Firefox dev-сервер
```

## Контроль качества

Все PR должны проходить:

- `npm run typecheck` — строгий режим TypeScript
- `npm run lint` — Biome линтинг + форматирование
- `npm run test` — юнит-тесты Vitest
- `npm run build:all` — сборка для всех браузеров

CI запускает все проверки автоматически при пуше и PR.

## Запросы фич и баг-репорты

Используйте [GitHub Issues](https://github.com/investblog/xpather/issues) или пишите в [ветке ZennoLab](https://zenno.club/discussion/threads/rasshirenie-dlja-poiska-xpath-puti.131812/).
