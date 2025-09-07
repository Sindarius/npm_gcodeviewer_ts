# Repository Guidelines

## Project Structure & Module Organization
- `src/` TypeScript source (renderers, parsers, WASM wrappers). Entry: `src/index.ts`.
- `dist/` Build output (ES/CJS bundles, types). Do not edit by hand.
- `WASM_FileProcessor/` Rust + wasm-pack project (web + node builds).
- `vue_test/` Demo app for manual validation.
- `Reference/` Docs and ancillary materials.

## Build, Test, and Development Commands
- `npm run dev` Start Vite dev server for local development.
- `npm run build` Build library bundles to `dist/`.
- `npm run preview` Serve the built output for a quick check.
- `npm run check` Type-check with `tsc --noEmit`.
- `npm run lint` Lint with ESLint (TypeScript rules enabled).
- `npm run build:wasm` Build Rust WASM (web target) into `WASM_FileProcessor/pkg/`.
- `npm run build:wasm:node` Build Rust WASM (node target) into `pkg-node/`.
- `npm run build:all` Build WASM then library.

Example: build everything from a clean checkout
```
npm ci
npm run build:all
```

## Coding Style & Naming Conventions
- Language: TypeScript (ESNext). Indentation: 3 spaces. Quotes: single. Semicolons: off.
- Run `npm run lint` and format with Prettier (`.prettierrc.js`).
- Names: `PascalCase` for classes/types, `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants.
- Keep public API minimal and re-export from `src/index.ts`.

## Testing Guidelines
- No formal test runner yet. Use:
  - `vue_test/` to validate rendering and interactions.
  - `test_matrix.js` to sanity-check WASM math (requires `npm run build:wasm`).
- Add small, focused utilities you can invoke directly for regression checks.

## Commit & Pull Request Guidelines
- Commits: imperative mood and concise (e.g., “Fix WASM init race”). Group related changes.
- Reference scope when useful (e.g., `processor:`). Link issues in body.
- PRs must include: summary, motivation, screenshots/GIFs for visual changes, steps to verify, and notes on WASM impact if applicable.

## WASM & Integration Notes
- Prereqs: Rust and `wasm-pack` (see `WASM-BUILD.md`).
- Do not manually edit generated files in `dist/` or `WASM_FileProcessor/pkg*/`.
- WASM entry points are wrapped in `src/wasmprocessor.ts` and used by `src/processor.ts`.

## Agent-Specific Tips
- Prefer targeted edits; avoid file renames that affect published paths.
- Keep changes consistent with ESLint/Prettier; run `check` and `lint` before proposing PRs.
