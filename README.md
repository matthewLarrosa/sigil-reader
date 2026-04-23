# Sigil Reader

Offline-first EPUB reader and audiobook generator built with Expo + TypeScript + Expo Router.

## Local Development

```bash
npm install
npm run start
```

## Quality Commands

```bash
npm run lint
npm run typecheck
npm test
```

## Project Layout

- `app/`: route-only files.
- `src/features`: domain features (library, reader, tts, player, settings).
- `src/config` and feature repositories: file-backed local state for library and settings.
- `src/native`: native bridge contracts (Kokoro spike path).
- `docs/architecture.md`: architecture standards.
