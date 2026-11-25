# mmar-modeling-client-react

The MMAR **modeling** client on **React 19 + TypeScript 5 + Vite 8 + MUI (Material
UI) 9 + Zustand 5**, with **three.js** for the 3D/2D/AR world and **yjs** for real-time
collaboration. It is a sibling of `mmar-metamodeling-client-react` and talks to the
same `mmar-server` and `mmar-sync-server`.

## What the app is

A 3D/2D/AR **model editor**. You log in, a tree of SceneTypes → SceneInstances
loads on the left; opening a SceneInstance creates a **tab** with its own
`THREE.Scene`. The tab's classes/relationclasses appear as palette buttons; you draw
class instances onto the canvas, connect them with relationclass lines (with
bendpoints), edit attribute values on the right, and everything auto-saves to the
REST API every 5 s. Scenes shared with ≥2 users become **collaborative**: a yjs
document syncs edits live through the sync server, with remote cursors, selections
and a user legend. Extras: model/metamodel import-export, file/gltf/image uploads,
expression-driven visual representations (`vizRep(gc)` code strings evaluated against
a `GraphicContext`), hybrid algorithms (robotics/URDF, statechange, objectspace), a
robot-joint simulation window, procedures ("Algorithms" dialog), and WebXR (AR/VR).

Interaction is a 5-state machine (`globalStateObject`): `0 Selection (drag)`,
`1 View`, `2 Drawing (insert)`, `3 DrawingRelationClass (line)`, `4 Simulation`.

Every change to the open scene is undoable (`Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z` or `Ctrl/⌘+Y`,
and the toolbar buttons) — see [Undo/redo](#undoredo).

## Tech stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Framework      | React 19 (single-page, **no router**)               |
| UI components  | MUI 9 + Emotion                                     |
| State          | Zustand                                             |
| Build / dev    | Vite 8                                              |
| Language       | TypeScript 5 (strict)                               |
| Tests          | Vitest + Testing Library + jsdom                    |
| 3D / AR        | three.js + troika-three-text + WebXR (`XRButton`)   |
| Collaboration  | `yjs` + `y-websocket` + `y-protocols`               |
| Robotics       | `urdf-loader`; `unzipit` for zipped URDF/model import |
| DTOs           | shared `mmar-global-data-structure` (gds), via `@gds` |
| Resizable UI   | `react-resizable-panels`                            |

Notifications are MUI-native: `logStore` + `Snackbar` (`AppSnackbar`). File pickers are
MUI file inputs, and keyboard shortcuts are a plain `keydown` hook
(`useKeyboardShortcuts`). There is no code editor here — vizRep and procedure code is
authored in `mmar-metamodeling-client-react`, which is where Monaco lives.

## Architecture

```
src/
  main.tsx                    # React entry: reflect-metadata (first import), MUI theme, CssBaseline
  App.tsx                     # renders AppLayout
  config.ts                   # API_URL / SYNC_URL / dev autofill, from import.meta.env
  constants.ts                # hardcoded meta-object uuids (robotic-system, statechange, ...)
  engine/                     # three.js world — plain-TS module singletons, NO React imports
    global-definition.ts      # the engine "god object": renderer, cameras, controls, tabContext[], flags
    index.ts                  # composition root + `engine.mount/unmount/whenReady/createXRButton` facade
    graphic-context.ts        # the `gc` API every stored vizRep code string is evaluated against
    interaction-handler.ts    # the 5-mode interaction state machine
    hybrid-algorithms/        # robotics/URDF + statechange + objectspace + the hybrid service
    ...                       # animator, initiator, coordinates-updater, deletion/creation handlers, ...
  resources/
    services/                 # framework-agnostic TS: api, backend-service, *-utility, event-bus, logger
      history-service.ts      # undo/redo: record a step, replay it, broadcast it (see below)
      scene-diff.ts           # the snapshot/diff rules history-service applies
    store/                    # Zustand stores (see below)
    collaboration/            # yjs shared-doc, y-mapping, awareness/cursor/selection renderers
      local-change-publisher.ts # the single way a local edit reaches collaborators
    util/                     # small helpers (describe-error, platform)
  views/                      # React components (MUI), one folder per region
    layout/                   # AppLayout (page skeleton) + TabBar + tabActions
    top-nav-bar/ toolbar/ left-nav/ right-nav/ state-window/ log-window/ footer/
    three-canvas/             # ThreeCanvas (engine.mount host) + XrButton overlay
    scenegroup/ model-tree/ palette/ attribute-window/ simulation-window/ user-legend/
    dialogs/                  # every modal (create/save-as/copy/delete/import/share/algorithm/upload/...)
    auth/ common/ hooks/
```

### Established idioms

- **Module singletons instead of a DI container.** Each engine class exports its single
  instance at the bottom of its own file (`export const interactionHandler = new
  InteractionHandler()`). Cross-singleton wiring that would create circular imports is
  composed in `src/engine/index.ts` — import engine singletons from `@/engine`, not
  their leaf files, so `index.ts` controls construction order. (Exception: the
  hybrid-algorithms singletons are imported by path, having no ordering dependency.)
- **One typed event bus** (`src/resources/services/event-bus.ts`), with
  `.subscribe(...).dispose()` / `.publish(...)`. Handlers are never `async` — wrap as
  `() => void doThing().catch(err => logger.log(...))`, since the bus never awaits.
- **All HTTP through `api.ts` + `backend-service.ts`.** `apiFetch` sets JSON headers
  (none for FormData); `backend-service.ts` holds one method per REST endpoint the app
  calls, attaches `authorization: Bearer <token>`, and **revives** responses into gds
  classes.
- **Revive with gds `fromJS`, never the app's `plainToInstance`.** The app and gds each
  ship their own `class-transformer` copy; gds `@Type` metadata lives only in gds's
  copy, so the app's `plainToInstance` shallow-revives and breaks `instanceof`. Always
  use the gds static `SceneInstance.fromJS(...)` etc. — the modeling client relies on
  `instanceof ClassInstance` checks throughout (`expression-utility`).
- **Engine mount facade.** `ThreeCanvas.tsx` calls `engine.mount(container)`; a
  memoized init-promise + monotonic mount-token make StrictMode double-mount and
  per-tab remounts safe. The single page-lifetime `WebGLRenderer` is re-attached,
  never recreated (browsers cap live WebGL contexts at ~16).
- **Zustand two forms.** Hook form (`useXStore(s => s.slice)`) only inside component
  bodies; `useXStore.getState()` everywhere else (engine, services, callbacks).
- **One way out to collaborators.** A mutation site never looks a shared session up
  itself: it calls `publishLocalChange(...)` /`markActiveSceneDirty()` from
  `resources/collaboration/local-change-publisher.ts`, which resolves the active tab's
  session, skips the publish while a REMOTE update is being applied (otherwise the edit
  echoes back to its sender), and is a no-op on a solo tab.
- **In-place gds mutation → bump a `revision`.** gds objects are mutated in place, so
  after a mutation React must observe, bump a store `revision` counter
  (`selectionStore`).

### Stores

| Store            | Role |
| ---------------- | ---- |
| `authStore`      | token + decoded JWT user; login/logout; restores from `localStorage["jwtToken"]` |
| `logStore`       | log entries + Snackbar state; `logger.ts` delegates here |
| `uiStore`        | open/close state for every dialog + `loading` + `autoSave` mirror |
| `tabsStore`      | reactive tab list + selection; the single mutation path also maintains `globalObject.tabContext` |
| `stateStore`     | display-only mirror of the engine interaction state |
| `selectionStore` | selected instance/type + `revision` bump; drives the AttributeWindow |
| `collabStore`    | per-tab collaboration status/access/banner/users |
| `historyStore`   | per-scene undo/redo stacks (snapshot + touched uuids); drives the toolbar buttons |

## Undo/redo

Scoped to the ACTIVE tab's SceneInstance, one stack per open scene
(`historyStore`), driven by `resources/services/history-service.ts`.

Recording is generic: mutation sites only announce that something happened — engine
modules publish `historyRecord` on the bus (they must not import the service, which
reaches back into the engine), views call `historyService.record()` directly — and the
service snapshots the scene and derives the changed UUIDs by diffing against the
previous entry. That is why coverage is total: creation, deletion, transforms, attribute
and table-attribute values, the scene name, a URDF import, an algorithm run — anything
that lands in the SceneInstance is picked up by the same code, with no per-action
inverse to maintain.

Applying a step is NOT a snapshot restore. Only the instances the recorded action
touched are moved back, so a collaborator's concurrent edits to other objects survive an
undo (`resources/services/scene-diff.ts`). The result is then pushed out through the
channels a normal edit already uses: gds objects are mutated in place and re-drawn via
`persistencyHandler`/`deletionHandler`, peers receive the equivalent
`applyLocalChangeToYDoc` deltas, and the scene is flagged dirty so auto-save PATCHes it.
Instances a peer changed are reported by SharedDocService over
`remoteSceneInstanceChanged` and excluded when a step is recorded, so the stack holds
local edits only.

Chords match the metamodeling client (shared `resources/util/platform.ts`), with one
difference: they stand down inside a text field, so `Ctrl+Z` in an attribute input undoes
the typing rather than the model.

## Shared DTOs (`@gds`)

The shared TypeScript DTOs in `../mmar-global-data-structure` are consumed
**unchanged** via the `@gds` path alias (configured in `vite.config.ts`,
`vitest.config.ts`, `tsconfig.json`); never imported with relative paths. They are
(de)serialized with `class-transformer`, and `reflect-metadata` is imported as the
**first line** of `src/main.tsx` and
`src/test-setup.ts` (gds decorators depend on it).

## Configuration

Config comes from `import.meta.env.VITE_*`, surfaced only through `src/config.ts`
(never read `import.meta.env` elsewhere):

| Var             | Default                 | Meaning |
| --------------- | ----------------------- | ------- |
| `VITE_API_URL`  | `http://localhost:8000` | Base URL of `mmar-server` (REST) |
| `VITE_SYNC_URL` | `ws://localhost:8060`   | `mmar-sync-server` (yjs WebSocket) |
| `VITE_USERNAME` | *(unset)*               | optional dev-only sign-in autofill |
| `VITE_PASSWORD` | *(unset)*               | optional dev-only sign-in autofill |

Set them in `.env` / `.env.development`. The **browser** runs on the host, so keep
`localhost` there even inside Docker. Inside the container, `mmar-server:8000` /
`mmar-sync-server:8060` are the reachable hostnames (used only for server-side curl
and the live integration tests — `localhost:8000` does not resolve in-container).

## Run / build

```bash
npm install
npm run dev        # Vite dev server on http://localhost:8085
npm run build      # tsc --noEmit && vite build
npm run start:prod # production build + `vite preview --host`
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
npm run lint       # eslint src --ext .ts,.tsx
```

> Do not rename the `start` / `start:prod` scripts — Docker's
> `start-node-modeling-client-react.sh` calls them.

Log in with the dev credentials `admin` / `admin`. The app needs `mmar-server`
(REST, `:8000`) and, for collaboration, `mmar-sync-server` (yjs, `:8060`) reachable.

### Testing notes

Tests are Vitest (node env by default; opt into jsdom per file with
`// @vitest-environment jsdom`). three.js and the collaboration modules need real
browser APIs, so unit tests mock `@/engine/global-definition` (importing it for real
builds a `WebGLRenderer` at module scope). Anything that transitively imports that
leaf must be mocked too. Live-server tests live in `**/*.integration.test.ts`, hit
`mmar-server` / `mmar-sync-server` directly, and **skip gracefully**
(`describe.skipIf`) when the servers are unreachable. In-browser WebGL rendering is
covered indirectly — jsdom component tests, engine unit tests and the production build —
rather than by a live render.

## Known oddities

A few behaviours look wrong at a glance and are deliberate; each is commented where it
lives, and several are pinned by tests. Read the comment before "fixing" one:

- **Shared sessions are keyed by tab INDEX** (`views/layout/tabActions.ts`). Closing a
  tab shifts every later tab down one, which strands a still-open shared session.
- **The Statechange rotation gate** applies only to the x axis
  (`engine/hybrid-algorithms/statechange-algorithms.ts`) — changing it changes what
  existing models do.
- **Inert placeholders**: the toolbar's zoom buttons, "Report Problem" in the user-info
  dialog, and the "Load to database" buttons in the import dialogs. They are kept
  visible rather than removed.
- **The `graphic-context` and `expression-utility` method surfaces are an API**: vizRep,
  mechanism and procedure code strings stored in the DATABASE call them positionally.
  Methods there are kept even when nothing in this repository calls them, and must not be
  renamed or have parameters inserted.
## License

This repository is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE Version 3. 

The GNU Affero General Public License (GNU AGPL) is a free, copyleft license published by the Free Software Foundation in November 2007, and based on the GNU GPL version 3 and the Affero General Public License. It is intended for software designed to be run over a network, adding a provision requiring that the corresponding source code of modified versions of the software be prominently offered to all users who interact with the software over a network (https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License).

The GNU AGPL is specifically designed to ensure cooperation with the community in the case of network server software. The licenses for most software are designed to take away your freedom to share and change the works. By contrast, the GNU AGPL is intended to guarantee your freedom to share and change all versions of a program–to make sure it remains free software for all its users (https://www.gnu.org/licenses/agpl-3.0.en.html).

This means that any kind of published change done to the repository must be published again under the same license. For more information have a look at the LICENSE file.
