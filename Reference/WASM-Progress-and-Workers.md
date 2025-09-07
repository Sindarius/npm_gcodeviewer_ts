# WASM Progress & Worker Strategy

## Problem
WASM functions run synchronously on the thread that calls them. In direct mode (no Web Worker), heavy WASM calls freeze the UI and progress indicators don’t repaint.

## Goals
- Keep the UI responsive during file processing and buffer generation.
- Provide timely, smooth progress updates (50–100ms cadence).
- Avoid breaking the public API for existing consumers.

## Current State
- Worker mode: `Viewer_Proxy` + `viewer.worker.ts` runs processing off the main thread. Progress messages (`{ type: 'progress', progress, label }`) flow to the UI.
- Direct mode: `viewer-direct` calls into WASM synchronously; UI can stall.
- Rust emits progress at coarse intervals (2–5%).

## Option A — Increase Rust Progress Cadence (Low Complexity)
- Files: `WASM_FileProcessor/src/processor.rs`, `WASM_FileProcessor/src/lib.rs`.
- Approach: throttle progress by time as well as percentage.
  - Track `last_report_time = js_sys::Date::now()`; call callback if `now - last_report_time >= 75ms` or progress delta >= threshold.
- Pros: smooth progress perception; trivial to implement; no API change.
- Cons: does not prevent UI freeze in direct mode (still runs on main thread).

## Option B — Hidden WASM Worker for Direct Mode (Medium Complexity)
- Idea: keep the direct public API, but internally proxy heavy WASM calls to a dedicated `wasm.worker.ts` so the main thread remains responsive.
- Components:
  - `src/wasm.worker.ts`: initializes `WasmProcessor`, handles messages.
  - `src/wasmClient.ts`: lightweight client used by `processor.ts`. In worker/proxy mode, calls the current sync API; in direct mode, posts to `wasm.worker.ts`.
- Message protocol:
  - Requests: `init`, `processFile { content }`, `generateRenderBuffers { nozzleSize, padding }`, `getSortedPositions`, `getPositionData { filePosition }`, `dispose`.
  - Progress: `{ type: 'progress', progress: number, label: string }`.
  - Responses: `{ type: 'ok', id, data } | { type: 'err', id, message }`.
- Transferables:
  - Return buffer views with transferable `ArrayBuffer`s: `matrix_data`, `color_data`, `pick_data`, `file_position_data`, `file_end_position_data`, `tool_data`, `feed_rate_data`, `is_perimeter_data`.
- Error handling: wrap WASM calls; stringify errors; never throw across the channel.
- Pros: no UI freeze in direct mode; isolates WASM faults.
- Cons: +150–250 LOC, lifecycle of a second worker, buffer transfer wiring.

## Not Now — Threaded WASM (High Complexity)
- `wasm-bindgen-rayon` with cross-origin isolation. Useful for multicore speedups, but still should live in a worker. Defer for now.

## API Impact
- No breaking changes. `processor.ts` swaps direct `WasmProcessor` usage for `WasmProcessorClient` with the same method surface.
- Worker mode behavior unchanged; direct mode becomes non-blocking.

## Implementation Plan
1) Rust: add time-based progress throttle (75–100ms) in processing and render-buffer generation.
2) Add `src/wasm.worker.ts` and `src/wasmClient.ts` with request/response + progress.
3) Update `processor.ts` to depend on the client; keep existing progress `postMessage` plumbing.
4) Use transferables for large arrays; verify memory isn’t retained.
5) Document usage and update examples.

## Testing Checklist
- Small/medium/large G-code files: progress frequency, labels, completion at 100%.
- Direct mode: UI stays interactive (typing, resize) while processing.
- Worker mode: no regressions; progress still visible.
- Error cases: invalid file, WASM init failure; ensure graceful messages and fallbacks.
- Performance: measure total time deltas (+/- 3%) vs. baseline; buffer transfer doesn’t dominate.

## Risks & Mitigations
- Extra worker increases complexity → encapsulate in `wasmClient.ts` with a simple Promise API.
- Large buffer copies → use transferables; avoid accidental cloning of typed arrays.
- Progress too chatty → throttle at both time and percentage.

## Open Questions
- Do we need cancellation mid-processing? If yes, add `cancel` message and cooperative checks in Rust.
- Should we make cadence configurable via env/props?
