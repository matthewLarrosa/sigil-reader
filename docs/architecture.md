# Sigil Reader Architecture

## Module Boundaries

- `app/`: Expo Router route files only. No domain logic.
- `src/features/*`: Feature-level domain logic, services, and feature screens.
- `src/config`: Local settings helpers and runtime configuration.
- `src/components`: Cross-feature UI primitives.
- `src/native`: Native bridge contracts and runtime probes.

## Naming Conventions

- Types and interfaces: `PascalCase`.
- Functions and variables: `camelCase`.
- SQL table names: `snake_case`.
- Files: `kebab-case.ts` / `kebab-case.tsx`.

## State and Storage Rules

- Persistent app state lives in app-managed JSON files until the native storage layer is reintroduced.
- Long-running/generated media files live under app-managed file storage.
- Feature services should return typed result objects, not loose tuples.
- Route files should compose and delegate to feature screen components.
