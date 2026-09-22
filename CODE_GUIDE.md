# Code guide (React newcomer-friendly)

A walkthrough of `mmar-modeling-client-react` written for someone who is **new to
React**. It doubles as a short React tour: each concept is explained the first time it
shows up. For the terse, reference-style overview see [README.md](README.md); this file
is the narrated version.

**Who reads this.** Two audiences, and they want different things:

- *Newcomers to the codebase* — read top to bottom.
- *Developers who know the sibling `mmar-metamodeling-client-react`* — the React idioms
  are the same, but the centre of gravity is not. Read
  [the comparison](#coming-from-the-metamodeling-client) first; after that the
  load-bearing sections are [the engine](#the-heart-an-engine-not-a-store),
  [the draw lane](#the-draw-lane), [undo/redo](#undoredo),
  [collaboration](#real-time-collaboration) and [gotchas](#gotchas).

---

## What this app is

`mmar-modeling-client-react` is the **modeling** client of MMAR, a port of the Aurelia
`mmar-modeling-client` onto React. The metamodeling client is where a modeling
*language* is designed: scene types, classes, attributes, and the code that draws them.
This client is where that language gets *used*. You open a scene, draw class instances
onto a 2D/3D canvas, connect them with relations, fill in attribute values, and, if the
scene is shared, watch collaborators do the same in real time. It can also enter WebXR
(AR/VR).

It talks to `mmar-server` (REST, port 8000) and `mmar-sync-server` (yjs over WebSocket,
port 8060), and uses the shared data classes from `mmar-global-data-structure` (`@gds`).

### The vocabulary

Everything comes in pairs: a **meta** object, defined in the metamodeling client, and
its **instances**, created here. The gds class names follow that pattern, and so does
the code: `metaUtility` looks things up on the meta side, `instanceUtility` on the
instance side.

| Meta (the language) | Instance (the model) | What it is |
|---|---|---|
| `SceneType` | `SceneInstance` | a diagram type / one diagram. One open SceneInstance is one tab. |
| `Class` | `ClassInstance` | a node drawn on the canvas |
| `Relationclass` | `RelationclassInstance` | a line between two nodes, optionally through bendpoints |
| `Role` | `RoleInstance` | one end of a relation (`role_instance_from` / `role_instance_to`); reference attributes point through one too |
| `Port` | `PortInstance` | a connection point attached to a class instance (or to the scene) |
| `Attribute` (+ `AttributeType`) | `AttributeInstance` | a named value on any of the above. A type with columns makes it a *table* attribute, a type with a Role a *reference* attribute. |

Three more words you will meet everywhere:

- **vizRep**: the `geometry` of a meta object. It is a JavaScript *source string*
  (`async function vizRep(gc) {…}`) that draws an instance. See
  [VizReps](#vizreps-code-that-lives-in-the-database).
- **bendpoint**: an intermediate point of a relation line. It is itself a
  `ClassInstance` (of the relation class's `bendpoint` meta class), stored in
  `class_instances` and referenced by uuid from the relation's `line_points`.
- **custom variables**: per-instance values a vizRep declares with `gc.setVariable(…)`,
  stored in `custom_variables` as `{ value, instance_adaptable, user_locked }`. An
  instance's scale lives there too.

### The stack

| Concern | Old (Aurelia) | New (React) |
|---|---|---|
| UI framework | Aurelia | **React 19** |
| Shared logic | DI-injected services + `EventAggregator` | **module singletons** + a typed **event bus** |
| Reactive UI state | Aurelia's observation | small **Zustand** stores, mostly one-way mirrors (see below) |
| UI components | Aurelia MDC (`<mdc-dialog>` …) | **MUI** (Material UI) 9 |

Around that: Vite 8, TypeScript 5 (strict), three.js 0.169 for the world, yjs for
collaboration. The README has the full table.

Traces of the port are everywhere and worth recognising. A field like
`private eventAggregator = eventBus;` sits where a constructor-injected dependency used
to be. A comment like `dialog-table-attribute.ts:228 — fieldChange` names the method of
the Aurelia original that a function was ported from.

There is **no router**. "Where you are" is which tab is open and what is selected on the
canvas.

### Coming from the metamodeling client

| | `mmar-metamodeling-client-react` | this client |
|---|---|---|
| Source of truth | Zustand (`selectedObjectStore` holds the whole metamodel) | the **three.js engine** (`globalObject` and friends); the Zustand stores mirror it for React |
| Objects in memory | plain parsed JSON; `instanceof` is broken, so code branches on a `type` string | revived gds classes; `instanceof ClassInstance` is relied upon |
| A tab is | one open meta object (a working copy) | one open SceneInstance with its own `THREE.Scene` |
| Undo | per-tab deep-cloned snapshots, restored wholesale | per-scene serialized snapshots, replayed as a *scoped diff* so collaborators' edits survive |
| three.js | a lazily loaded chunk behind the VizRep editor | the app itself, loaded eagerly |
| Code editor (Monaco) | yes | none; vizRep code is written in the metamodeling client |
| Real-time collaboration | none | yjs, per shared scene |
| Sign-out teardown | two modules (`session-reset` + `engine-reset`) | one module (`session-reset`) |
| Undo chords | Ctrl/⌘ via `platform.ts` | the same chords, but they stand down while a text field has focus |

The shared DNA: the event-bus shim (and its "never an `async` subscriber" rule),
`platform.ts`, `describe-error.ts`, the `api.ts` FormData rule, the engine mount facade
(memoized init promise + mount token), "hook form in the render body, `getState()`
everywhere else", and `config.ts` as the only reader of `import.meta.env`.

---

## A 5-minute React primer (just what this app uses)

Before the walkthrough, here are the React ideas that appear everywhere:

1. **A component is a function that returns markup.** That markup is JSX, HTML-like
   syntax inside JavaScript. `App()` returning `<AppLayout />` is a component rendering
   another component.

2. **Props** are the arguments you pass to a component, like HTML attributes:
   `<PaletteButtonGroup title="Classes" stateToEnter={2} … />`. The class palette and
   the relation-class palette are this one component with different props.

3. **State + re-rendering.** When data a component displays changes, React **re-runs
   the function** and updates the screen. The two ways data changes here:
   - `useState`: local state private to one component (the text in the tab-rename
     dialog, say).
   - a **Zustand store**: global state shared across the app (the logged-in user, the
     open tabs). When a store value changes, *every* component reading that value
     re-renders.

   And one way it does **not**: mutating an object in place. React notices *new
   values*, not changed insides, and this app mutates gds objects and three.js meshes
   in place all the time. That one fact explains the `revision` counter and the
   "please re-read" bus events you will meet below.

4. **Hooks** are special functions starting with `use…`. Rule: call them only at the
   top level of a component, never in loops or conditions. The ones here:
   - `useState`: local state.
   - `useEffect`: run side effects (subscribe, start a timer, mount the engine) *after*
     render. The dependency array controls *when* it re-runs: `[]` = once on mount,
     `[x]` = whenever `x` changes. It can return a **cleanup** function. Nearly every
     bus subscription in a component is written
     `useEffect(() => { const sub = eventBus.subscribe(…); return () => sub.dispose(); }, […])`.
   - `useRef`: a mutable box that survives re-renders without causing one. It holds the
     canvas container element, "am I still mounted?", the id of the newest async
     rebuild.
   - `useCallback` / `useMemo`: a stable function reference / a cached computation.

5. **The `key` prop.** When rendering a list with `.map(...)`, each item needs a unique
   `key` so React can track it. Tabs are keyed by scene uuid and log rows by an `id`
   (never by index; see [Performance](#performance-the-rules-that-keep-it-fast)).

6. **Controlled inputs.** An input whose `value` comes *from* state and whose
   `onChange` writes *back* to it. The attribute window uses a variant: keystrokes
   update *local* state only, and the value is **committed** to the gds object on blur,
   Enter or slider release, after it has been validated (see [Saving](#saving)).

That is enough to read everything below.

---

## How it is wired, top to bottom

### Entry point — [src/main.tsx](src/main.tsx)

This is where the app boots:

- Line 1: `import "reflect-metadata"` **must be first**. The gds data classes use
  decorators (via `class-transformer`) that need it.
- `import "@/resources/services/session-reset"` is a **side-effect import**. Nothing
  references it; importing the module is what subscribes the sign-out teardown.
  Dropping the line silently disables it. See
  [Session teardown](#session-teardown-signing-out).
- It builds an MUI **theme**: the MMAR brand palette (primary `#9ec8e1`, secondary
  `#ff8a65`, …), every button rendered black, arrow tooltips, and no upper-casing of
  button labels. `<CssBaseline />` normalizes browser styles.
- `<React.StrictMode>` is a dev-only wrapper that mounts every component, unmounts it
  and mounts it again, to surface bugs. It is why effects run twice in development, and
  why the [engine's mount path](#engine-lifecycle) works so hard to be idempotent.

[App.tsx](src/App.tsx) is a one-liner returning `<AppLayout />`.

There is no lazy loading. Through `session-reset` (and through `ThreeCanvas`), the
engine is imported at page load, and importing it constructs a `WebGLRenderer`. The
WebGL context exists before anyone has signed in.

### The layout — [src/views/layout/AppLayout.tsx](src/views/layout/AppLayout.tsx)

The page skeleton. Things to notice:

- **Auth gating** is conditional rendering. The toolbar row, the tab row and the
  three-column body render only while `currentUser` is set.
  `<SignInDialog open={!currentUser} />` is non-dismissable: the MUI `Dialog` gets no
  `onClose`, so neither Escape nor a backdrop click has anything to call. Signing in re-renders with a
  user, the body mounts, and in mounting `SceneGroup` builds the scene tree and
  `ThreeCanvas` mounts the engine.
- **Signing out unmounts the body, but destroys nothing the engine built.** That job
  belongs to [session-reset](#session-teardown-signing-out).
- `useKeyboardShortcuts()` is mounted here, once.
- Ctrl+S publishes `ctrlPlusSPressed`; an effect here turns that into
  `openDialog("saveAs")` and disposes the subscription on unmount.
- Column widths persist through react-resizable-panels v4's
  `useDefaultLayout({ id: "mmar-modeling-panels" })` (v4 removed `autoSaveId`). The
  hook is called unconditionally even though the body it serves is conditional: that is
  the rules of hooks at work.
- **Every dialog is mounted here**, closed, and opens itself from `uiStore`. The
  exceptions are the attribute dialogs (reference, table, uploads), which live inside
  `AttributeWindow`, next to the state they act on.

So the visual hierarchy is as follows; the Toolbar, the tab row and the three columns
exist only while someone is signed in:

```
AppLayout
├─ TopNavBar               File / View / Edit / Diagram / Settings, Algorithms, Simulation
├─ Toolbar                 Logout, AutoSave, undo/redo, delete, 2D/3D + gizmo mode, user legend
├─ TabBar | StateWindow    open scenes | current mode, View Mode, Info
├─ Group                   three resizable columns
│   ├─ LeftNav             "Scenes" | "Model tree"
│   │   ├─ SceneGroup                        SceneTypes → SceneInstances
│   │   ├─ Class/RelationclassButtonGroup    the palettes (once a tab is open)
│   │   └─ ModelTree                         the open scene's objects, by metaclass
│   ├─ ThreeCanvas + XrButton                the engine's canvas
│   └─ RightNav
│       ├─ AttributeWindow                   (SimulationWindow in simulation mode)
│       └─ LogWindow
├─ AppFooter
├─ SignInDialog, AppSnackbar, LoadingWindow
└─ CreateNewScene, SaveAs, CopyScene, DeleteScene, ImportModel, ImportMetamodel,
   MapFromFile, UserInfo, ShareScene, Algorithm       (closed until uiStore opens them)
```

---

## The heart: an engine, not a store

In the metamodeling client the app's state lives in Zustand. Here it lives in a
**three.js engine**: plain TypeScript under [src/engine/](src/engine/), with no React in
it. The model being edited is a graph of gds objects (a `SceneInstance` holding class,
relation, port and attribute instances). The engine and the services **mutate that graph
in place**, next to the three.js meshes that draw it. React's job is to render panels
*around* the canvas, and it can only see what the engine pushes out to it.

### `globalObject` — the engine's shared state

[global-definition.ts](src/engine/global-definition.ts) exports one `GlobalDefinition`
instance that every engine module and most services import. The fields that matter
most:

| Field | What it is |
|---|---|
| `renderer`, `camera`, `normalCamera2d` / `normalCamera3d`, `ARCamera`, `orbitControls`, `transformControls` | the three.js machinery; one renderer for the whole life of the page |
| `scene` | the **active tab's** `THREE.Scene` (swapped on every tab switch) |
| `tabContext[]`, `selectedTab` | one entry per open tab: `{ sceneType, sceneInstance, threeScene, contextDragObjects, isShared }` |
| `dragObjects` | the raycasters' pick list; an alias of the active tab's `contextDragObjects` |
| `updateLinesArray`, `buttonObjects` | the relation lines the render loop re-routes; the clickable simulation buttons |
| `attribute_instances`, `role_instances` | flat lists of the open scene's attribute and role instances, for lookups |
| `current_class_instance`, `current_port_instance` | the vizRep pipeline's "instance being drawn" pointers, **not** the selection ([why](#selection-three-things-that-sound-alike)) |
| `render`, `runMechanism`, `objectScaled`, `readyForVizRepUpdate` | flags the render loop and the vizRep pipeline coordinate on |
| `autoSave`, `doSceneInstancePatch`, `doSceneInstancePatchLocal` | the auto-save toggle and the two dirty flags ([Saving](#saving)) |
| `sceneTypes`, `sceneTree`, `importSceneTypes`, `importSceneInstances` | the metamodel and the tree the left panel renders |
| `sharedDocServiceRef` | a back-reference to the collaboration service (below) |

Constructing it builds a real `WebGLRenderer` **at module scope**. The engine is
therefore live from page load, and any test that imports this file, even transitively,
needs a mock ([Tests](#tests)).

Two members are deliberate indirections:

- `accessToken` is a getter over [services/token.ts](src/resources/services/token.ts),
  so engine code can read the JWT without depending on `authStore`.
- `sharedDocServiceRef` is set by `SharedDocService`'s own constructor. It lets the
  engine reach a shared session **without importing the collaboration layer**; the
  import in `global-definition.ts` is type-only and vanishes at build time.

### Module singletons and the composition root

Each engine file ends with its own instance:
`export const interactionHandler = new InteractionHandler()`. What used to be Aurelia
constructor injection is now a field initialiser pointing at another module's
singleton.

[engine/index.ts](src/engine/index.ts) is the **composition root**. It imports every
singleton in dependency order (`global-definition` first), so the constructors run in a
deterministic order; it re-exports them; and it exports the `engine` mount facade. The
barrel `@/engine` is the documented import point, and it is also what view tests mock.
Expect exceptions: the hybrid-algorithms singletons are imported by path, and several
services (plus `useKeyboardShortcuts`) import leaf files such as
`@/engine/global-definition` directly.

Some imports exist only for their side effects, and removing them breaks things
silently:

- `engine/index.ts` imports `vizrep-update-checker`, whose constructor subscribes the
  `checkForVizRepUpdate*` channels. Without it, attribute edits never redraw.
- `engine/coordinates-updater.ts` imports `@/resources/collaboration/shared-doc-service`
  only so that the service is constructed, which is what sets
  `globalObject.sharedDocServiceRef`.
- `history-service` and `persistency-handler` also subscribe to bus channels in their
  constructors. They are imported from so many places that they are always loaded.

### The stores are mirrors

React cannot observe `globalObject`. Whatever a panel needs is pushed **one way**, from
the engine or a service into a small Zustand store in
[src/resources/store/](src/resources/store/). A store is created with `create(...)` and
holds both data and the functions that change it.

| Store | Written by | Holds | Read by (e.g.) |
|---|---|---|---|
| [authStore](src/resources/store/authStore.ts) | itself: `login` / `logout` / `restore` | `currentUser`, decoded from the JWT | AppLayout, Toolbar |
| [logStore](src/resources/store/logStore.ts) | `logger.log()` | log entries (newest first, capped at 500) + the snackbar | LogWindow, AppSnackbar |
| [uiStore](src/resources/store/uiStore.ts) | views | which dialog is open and its payload; `loading`; a mirror of `globalObject.autoSave` | every dialog, LoadingWindow, AutoSave |
| [tabsStore](src/resources/store/tabsStore.ts) | instance-utility (open), tabActions (select / rename / close), session-reset | `tabs[]` (name, uuid, isShared) + `selectedTab` | TabBar, palettes, ModelTree, UserLegend |
| [stateStore](src/resources/store/stateStore.ts) | `globalStateObject.setState` | the active interaction mode's name | StateWindow, RightNav, UserInfoDialog |
| [selectionStore](src/resources/store/selectionStore.ts) | the interaction handler; `bump()` from anything that edits the selected instance in place | selected uuid + kind + a `revision` counter | AttributeWindow, ModelTree |
| [collabStore](src/resources/store/collabStore.ts) | shared-doc-service | per-tab connection status, access, banner, users | UserLegend, AutoSave |
| [historyStore](src/resources/store/historyStore.ts) | history-service | per-scene undo/redo stacks | Toolbar |

Three rules follow:

- **The engine stays the source of truth.** Don't make a store authoritative for
  something the engine also holds. `uiStore.autoSave` only mirrors
  `globalObject.autoSave`, and the AutoSave switch writes both together. (`tabsStore`
  is a special case: it and `tabContext` are kept in lockstep; see
  [Tabs](#tabs-two-halves-in-lockstep).)
- **`revision` is how an in-place edit becomes visible.** `selectionStore.bump()`
  increments a counter; `AttributeWindow` subscribes to it and rebuilds. Whatever
  mutates the selected instance in place (a peer's edit, an undo, a table edit) bumps
  it.
- **Two ways to read a store**, and the difference matters:
  - `useTabsStore((s) => s.selectedTab)` is the **hook form**, used inside a
    component's body. It *subscribes*: the component re-renders when that slice
    changes.
  - `useTabsStore.getState().openTab(…)` is the **imperative form**, used in event
    handlers, services and the engine. It reads or calls *without* subscribing. Most
    writers in this app are engine and service code, so you will see it constantly.

### The event bus

[event-bus.ts](src/resources/services/event-bus.ts) is a tiny typed publish/subscribe
shim carried over from Aurelia's `EventAggregator`. `subscribe` returns `{ dispose }`,
so a React effect can clean up. Channel names and payload types are declared once, in
`EventPayloads`.

- **Never subscribe with an `async` callback.** `publish()` calls each listener
  synchronously and throws away what it returns, so a rejection would vanish as an
  unhandled rejection. Write `() => void doThing().catch((err) => logger.log(…, "error"))`.
- Dialogs are **not** opened over the bus; `uiStore` owns dialog state.
- The bus is also how engine modules talk "upwards" without importing modules that
  import them. `historyRecord` exists for exactly that reason ([Undo/redo](#undoredo)).

| Channel | Published by | Consumed by | Meaning |
|---|---|---|---|
| `login` | authStore | session-reset | `false` tears the session down |
| `tabChanged` | instance-utility, tabActions, snapshot-service | palettes, AttributeWindow, ModelTree, SimulationWindow | a tab was opened, selected or closed |
| `sceneInstanceMutated` | creation / deletion handlers, SceneGroup, history-service | ModelTree, SimulationWindow, PositionPanel | instances were added, removed or replayed |
| `updateSceneGroup` | dialogs, tabActions, scene-tree-service, history-service | SceneGroup, ModelTree | the tree's data changed; re-render it |
| `updateAttributeGui` / `removeAttributeGui` | interaction-handler, global-state-object, … | AttributeWindow | the selection changed / was cleared (published 10 ms apart) |
| `checkForVizRepUpdate` / `…ByAttributeInstance` | attribute edits, the expression API, shared-doc-service, history-service, image upload | vizrep-update-checker (and ModelTree, for Name edits) | a value changed; redraw whatever reads it |
| `historyRecord` | engine modules, PositionPanel, useKeyboardShortcuts | history-service (PositionPanel also listens, to re-read its fields) | record an undo step |
| `remoteSceneInstanceChanged` | shared-doc-service | history-service, ModelTree, PositionPanel | a peer changed these instances |
| `remoteClassInstanceAdded` / `remoteRelationInstanceAdded` | shared-doc-service | persistency-handler | draw what a peer added |
| `sharedSceneReconnected`, `sceneAccessRevoked`, `sceneAccessGranted` | shared-doc-service, ShareSceneDialog | SceneGroup, history-service | the collaboration lifecycle |
| `ctrlPlusSPressed` | useKeyboardShortcuts | AppLayout | open the save dialog |
| `gltfUploaded` / `imageUploaded` / `fileUploaded` | the upload dialogs | AttributeWindow | an upload rewrote an attribute value |
| `openReferenceDialog` | AttributeWindow | ReferenceAttributeDialog | which attribute the shared dialog is for |

`tableAttributeChanged` is declared and subscribed (by `AttributeWindow`), but nothing
publishes it; the table dialog bumps `selectionStore` instead.

---

## Engine lifecycle

The engine is a **page-lifetime singleton**, one `WebGLRenderer` and one set of cameras,
but the component that shows it mounts and unmounts: StrictMode does it twice at start,
and every sign-out/sign-in does it again. `engine.mount(container)` in
[engine/index.ts](src/engine/index.ts) therefore has to be idempotent and
concurrency-safe:

- The expensive `initiator.init()` + `initEventListeners()` + `arInitiator.enableXR()`
  run **once per page**, guarded by a memoized **promise**. (A boolean set *after*
  `await init()` lets two racing mounts both run the heavy branch, duplicating the orbit
  controls and the window resize listener.) A failed init resets the memo so a later
  mount can retry.
- Every mount then just **re-attaches** `renderer.domElement` to the new container and
  restarts the animation loop. The renderer is never recreated: browsers cap live WebGL
  contexts at about 16 and silently drop the oldest.
- `mount()` returns a monotonic **mount token**, and `unmount(token)` is a no-op if a
  newer mount has taken ownership. StrictMode reuses the same container element, so
  ownership cannot be decided by comparing elements.
- `engine.whenReady()` is for callers that hold no token but must not touch engine
  state before init: SceneGroup's `openScene`, the XR button. It never rejects.
- `engine.setThreeDimensional(is3d)` swaps the camera and orbit controls. `mount()`
  re-applies it every time, so a toggle that lands mid-init cannot leave them out of
  sync. **2D (orthographic) is the modeling default.**
- `engine.createXRButton()` builds three's XR entry button against our renderer;
  [XrButton.tsx](src/views/three-canvas/XrButton.tsx) overlays it on the canvas.

[ThreeCanvas.tsx](src/views/three-canvas/ThreeCanvas.tsx) is the host. It owns nothing
about the 3D world:

- An effect with `[]` calls `engine.mount(containerRef.current)`; after that, a
  `ResizeObserver` keeps the renderer and cameras in step with the panel.
- The cleanup waits for the mount promise, then calls `engine.unmount(token)`.
  Otherwise init could finish *after* unmount and leave a render loop running on a
  detached canvas.
- `mouseleave` calls `rayHelper.clearCursor()`, so collaborators stop drawing your
  pointer.
- **Two 1-second heartbeats. Keep both.** The first sets `globalObject.render = true`
  (some update paths mutate meshes without asking for a frame) and
  `runMechanism = true`, which is what drives mechanisms. The second calls
  `hybridAlgorithmsService.updateHybridAlgorithmAttributes()`; for a Statechange scene
  that reads each Reference object's pose back into its attributes, and for every other
  scene type it returns immediately.

**Pointer listeners live on the renderer's canvas, not on the container.**
`initEventListeners` runs once per page, but the container is a React element recreated
on every remount, while the canvas is re-parented. A `pointermove` listener on the
container used to die after the first sign-out/sign-in round trip, freezing your cursor
on collaborators' screens until you clicked. The `pointerdown` listener (the interaction
handler) must also be registered *after* the transform controls' own: `scene-initiator`
removes it and adds it back around creating new controls.

### The render loop

[animator.ts](src/engine/animator.ts) is driven by
`renderer.setAnimationLoop(arInitiator.render)`. Going through the renderer's loop is
what lets it drive WebXR sessions too; while an XR session is presenting,
`arInitiator.render` forces a frame on every tick.

`animate()` draws only when **`globalObject.render`** is true. That is a dirty flag: if
you mutate a mesh, set it (or wait up to a second for the heartbeat). Each drawn frame:

1. re-fits collaborators' selection boxes and cursors, which follow objects peers move
   and keep their labels at a constant screen size;
2. renders;
3. runs the open scene's **mechanisms** if `runMechanism` is set;
4. snapshots every drag object's position, quaternion and scale into flat arrays and
   compares them with the previous frame's (positions with a tolerance of 0.01,
   rotations and scales with 1e-4);
5. if a position changed, a relation is being drawn, or `objectScaled` is set:
   re-routes every relation line (`setPos`) and has
   [coordinates-updater](src/engine/coordinates-updater.ts) **write the new positions
   back onto the gds instances**. Rotations and scales get the same write-back when
   their own arrays changed. Each write-back also publishes the change to collaborators
   and flags the scene dirty.

Step 5 means a drag reaches the gds instance a frame *after* the mouse-up. Undo has to
account for that ([`afterTransformSync`](#undoredo)).

`setPos` is the line maths: it routes a relation through its bendpoints, trims both ends
back to the surfaces of the objects they connect (`rayHelper.shootRayFromObject`),
orients the end meshes such as arrowheads, and rebuilds the line geometry only when the
route actually changed.

---

## Interaction: the five modes

[global-state-object.ts](src/engine/global-state-object.ts) holds the state machine and
[interaction-handler.ts](src/engine/interaction-handler.ts) handles clicks: its
`onDocumentMouseDown` is the canvas's `pointerdown` listener and dispatches on the mode.

| # | `stateNames[n]` | A click on the canvas… | Gizmo | Orbit rotate | Cursor |
|---|---|---|---|---|---|
| 0 | `SelectionMode (drag)` | picks an object: attaches the transform gizmo (left = translate, right = scale, middle = rotate in 3D) and shows its attributes. Empty space → ViewMode. | on | off | grab |
| 1 | `ViewMode` | moves the camera only; clicking an object switches to SelectionMode and picks it | off | on | pointer |
| 2 | `DrawingMode (insert)` | drops an instance of the armed palette class at the plane hit (rounded to 0.1), with its ports and attributes | off | on | copy |
| 3 | `DrawingModeRelationClass (line)` | the first click on an object starts a relation; clicks on empty space add bendpoints; a click on a second object closes it; right-click abandons it | off | on | copy |
| 4 | `SimulationMode` | runs the clicked *button* object's simulation code | off | on | help |

The engine boots in SelectionMode, and a right-click generally drops back to ViewMode.

- `globalStateObject.setState(n)` sets the name, mirrors it into `stateStore`, then
  `onStateChange()` **clears the selection and detaches the gizmo** before applying the
  mode's settings. Entering a mode always deselects. It touches controls that exist only
  after the engine has mounted, which is why the views that call it guard with
  `engine.isInitialized`.
- The mode **names are compared as strings** (RightNav checks `"SimulationMode"`;
  UserInfoDialog matches all five), so keep them byte-identical.
- **The palettes** ([PaletteButtonGroup.tsx](src/views/palette/PaletteButtonGroup.tsx)):
  clicking a class arms it on `globalClassObject` and enters mode 2; a relation class
  arms `globalRelationclassObject` and enters mode 3. Button icons are *scraped* out of
  each meta object's vizRep source by `globalClassObject.getIcon`: the first `data:`
  literal after `let icon`, else after `let map`, with `getImageByUUID(...)` references
  resolved through the file cache.
- **Relation ends are checked against the metamodel** by
  [consistency-checker.ts](src/engine/consistency-checker.ts): the picked class or port
  must be listed on the role for that end, and one more role instance must still fit
  the reference's min/max. A refusal shows the "not allowed" snackbar.
- `onDocumentMouseDown` runs inside the [draw lane](#the-draw-lane), one click at a
  time.

Keyboard shortcuts live in
[useKeyboardShortcuts.ts](src/views/hooks/useKeyboardShortcuts.ts): Delete, arrow-key
nudges of ±0.1, Ctrl+S, and undo/redo.

### Selection: three things that sound alike

| | What it is | Use it for |
|---|---|---|
| [`globalSelectedObject`](src/engine/global-selected-object.ts) | the picked mesh, the red `BoxHelper` around it, and `getSelectedInstance()` (resolved asynchronously after the pick) | **the** selection. Commands act on it: `deletionHandler.onPressDelete` reads it and nothing else. |
| `globalObject.current_class_instance` / `current_port_instance` | the vizRep pipeline's scratch pointers: "which instance am I drawing right now" | drawing only. Every draw path writes them, and paths that draw on someone else's behalf (a peer's change, a vizRep refresh) **borrow and restore** them. |
| [`selectionStore`](src/resources/store/selectionStore.ts) | uuid + kind + `revision`, pushed from the interaction handler | rendering: AttributeWindow, ModelTree |

Delete used to act on `current_class_instance`, which named whatever had been drawn
last. It fired on a box just dropped in drawing mode, or on something a collaborator's
change had redrawn. The class comments tell that story; don't reintroduce it.

Selecting also publishes `selection: { uuid }` over the active tab's awareness, so
collaborators draw a box around the same object; `removeObject()` publishes `null`.

---

## VizReps: code that lives in the database

Every meta Class, Relationclass and Port has a `geometry` field holding **JavaScript
source**, `async function vizRep(gc) { … }`, written in the metamodeling client and
stored in the database. Drawing an instance means:

1. `metaUtility.parseMetaFunction(source)` compiles it with
   `new Function('"use strict";return (' + source + ')')()`. That `new Function` is the
   whole point of the feature, not a smell to refactor out.
2. `graphicContext.runVizRepFunction(fn)` calls it with the
   [`GraphicContext`](src/engine/graphic-context.ts) as `gc`. The stored code calls
   `gc.graphic_cube(…)`, `gc.graphic_text(…)`, `gc.graphic_gltf(…)`,
   `gc.rel_graphic_line(…)`, `gc.setVariable(…)`, and reads model values through the
   expression API in [expression-utility.ts](src/resources/services/expression-utility.ts)
   (`attrval`, `attrvalByName`, the relation walkers…).
3. `gc.drawVizRep(position, instance)` (`drawVizRepPort` for a port) merges what the run
   accumulated into one mesh, sets **`mesh.uuid = instance.uuid`**, and adds it to the
   scene and to `dragObjects`; `gc.resetInstance()` empties the buckets for the next
   run. For a relation, `gc.drawVizRep_rel()` returns the `Line2`, and the caller gives
   it the relation's uuid and adds it.

The same compile-and-call pattern runs three other kinds of stored code, all against the
expression API: **mechanisms** (attribute values of the Mechanism type, run by the render
loop while `runMechanism` is set; `mechanism-utility`), **procedures** (the Algorithms
dialog; `procedure-utility`) and **simulations** (button objects clicked in
SimulationMode; `simulation-utility`).

What follows from this:

- **The `graphic-context` and `expression-utility` method surfaces are an API.** Code
  stored in the database calls them by name, with positional arguments. Don't rename
  them, reorder or insert parameters, or delete methods this repository never calls.
- **Mesh uuid = instance uuid** is how the whole app maps between three.js and gds:
  picking, write-backs, deletion, undo, collaboration. A relation's `Line2` and its end
  meshes deliberately share the relation's uuid.
- **Redraw on attribute change.**
  [vizrep-update-checker.ts](src/engine/vizrep-update-checker.ts) re-runs an instance's
  vizRep when one of its attributes changes, but only if the meta attribute's **name or
  uuid appears as a substring** of the vizRep source. Before the re-run it drops the
  custom variables that are not `user_locked`, so computed values get recomputed while a
  label the user dragged by hand (which `transform-control-events` marks locked) stays
  where it was put.
- **Some metamodels have behaviour outside the vizRep pipeline**, the *hybrid
  algorithms* in [engine/hybrid-algorithms/](src/engine/hybrid-algorithms/):
  - Robotic system: a zipped URDF (File ▸ Map file to SceneInstance) becomes Link and
    Joint instances; joint edits and the simulation sliders re-pose the robot.
  - ObjectSpace: an uploaded glTF or image swaps an instance's mesh.
  - Statechange: a Reference instance adopts the mesh of what it references.

  Everything goes through `hybridAlgorithmsService.checkHybridAlgorithms(…)`, which
  dispatches on the **open tab's scene type**, so call sites carry no scene-type checks.
  The scene types, classes and attributes involved are hard-coded uuids in
  [constants.ts](src/constants.ts): contracts with rows of the demo metamodel, not
  values to regenerate or tidy.

### The draw lane

[draw-lock.ts](src/resources/services/draw-lock.ts) provides `runExclusive(task)`, which
queues async tasks and runs them one at a time.

**Why:** drawing is a multi-`await` sequence over **shared, single-slot state**: the
`graphicContext` singleton's buckets, `current_class_instance`, and `selectedTab`, which
a peer's draw briefly switches to the tab the update belongs to. A local click and a
peer's change arriving out of a websocket callback used to interleave at some `await`:
one reset the context the other was still drawing into, and an instance vanished or a
half-drawn relation broke.

**What runs in it:** canvas clicks, model-tree selection (`selectInstanceByUuid`),
vizRep refreshes, drawing what a peer added (`persistencyHandler.drawForTab`), and
undo/redo replays.

**Rules:**

- Wrap a *whole* draw sequence.
- **Never `await runExclusive(…)` from inside the lane.** It is not reentrant, so that
  deadlocks. Work queued from inside another lane task is handed over with
  `void runExclusive(…)`.
- A failing task does not stall the lane.

Two related safety valves. `expressionUtility` waits for `readyForVizRepUpdate` for at
most **2 s**: a vizRep that asks for a redraw from inside its own update could otherwise
never see the flag clear, and with the lane held that would freeze the canvas. And the
ObjectSpace algorithms build a **private `GraphicContext`** per call, because the vizRep
refresh that runs just before them is fire-and-forget and may still be drawing into the
shared one.

---

## Loading and opening scenes

### gds classes, and why `instanceof` works here

The shared DTOs in `../mmar-global-data-structure` are consumed through `@gds`, straight
from source. The rule here is the **opposite** of the metamodeling client's: every server
response is revived into real gds classes with gds's static `X.fromJS(…)`
([backend-service.ts](src/resources/services/backend-service.ts) does it for every
endpoint), and the code relies on `instanceof ClassInstance` / `RelationclassInstance` /
`PortInstance` (in `graphicContext.updateVizRep` and in the expression API, for
example).

- **Never use the app's `plainToInstance`.** The app and gds each bundle their own copy
  of class-transformer, and the `@Type` metadata lives only in gds's copy. The app's
  copy therefore revives shallowly: nested instances stay plain objects and every
  downstream `instanceof` silently fails.
- Deep copies go through `JSON.parse(JSON.stringify(x))` and then
  `SceneInstance.fromJS(…)` (snapshot-service, copySceneModel, history-service).
  Instances arriving from a peer are built with real constructors
  (`new ClassInstance(…)`) in y-mapping.
- `geometry` is typed `Function` in gds but holds a **string** at runtime. Read it with
  `.toString()` and cast when writing. Don't "fix" gds; the server shares it.
- **Errors:** most backend-service methods log the failure (which raises the snackbar)
  and resolve to `undefined` or `[]`. The exceptions throw an `ApiError` carrying the
  status, because their callers branch on it: the scene PATCH (403) and the three
  share-dialog endpoints (404 / 409).

### The scene tree

[SceneGroup.tsx](src/views/scenegroup/SceneGroup.tsx), with the fetching in
[scene-tree-service.ts](src/resources/services/scene-tree-service.ts):

- **On mount**, which means after sign-in: `metaUtility.getFiles()` fills the file cache
  (uuid → `[File, data-URL or text]`) that icons, image vizReps and the glTF and URDF
  loaders read from. Then one `GET metamodel/sceneTypes` builds the SceneType level.
- **Instances load lazily.** A SceneType's SceneInstances are fetched the first time
  its arrow is expanded, because the server returns every scene **fully hydrated** and
  an eager load scaled startup with the whole database. The one feature that needs every
  scene, the reference dialog, calls `loadAllSceneInstances()` behind its own spinner.
- Fetched instances are **merged by uuid, never assigned over `children`**. An open
  tab's SceneInstance may be the very object in the tree, carrying unsaved edits.
- A **generation counter** protects against a sign-out landing mid-fetch: a response
  fetched with the previous user's token is dropped.
- The tree is **edited in place**. `updateTree` (on `updateSceneGroup`) folds open tabs
  and imported scenes in; `removeSceneInstanceFromTree` takes a deleted scene out. There
  is deliberately no "rebuild" channel: a rebuild would drop local-only nodes (imports,
  scenes created with auto-save off).
- **Context menus carry their target.** Right-clicking a row hands that SceneType or
  SceneInstance to the dialog as its payload
  (`openDialog("copyScene", { sceneInstance })`). That is why the Duplicate, Share and
  Delete dialogs have no scene pickers: a picker would need `loadAllSceneInstances()`
  just to fill a dropdown.
- The canonical arrays are `globalObject.sceneTypes` / `sceneTree`; the component
  copies them into local state to render (`syncTreeFromGlobal`).

### Opening a scene, step by step

A double-click on a SceneInstance runs `openSceneWithRollback`, which calls `openScene`:

1. If it is already open, `switchToTab` to it and stop.
2. On its first open, `snapshotService.setSceneInstanceSnapshot`: the baseline a refused
   save reverts to.
3. `await engine.whenReady()`, because a double-click can beat the canvas mount.
4. `sceneInitiator.sceneInit()` builds a fresh `THREE.Scene`: transform controls, two
   lights, the invisible intersection plane, the pointer sphere, the grids.
5. `instanceUtility.createTabContextSceneInstance` pushes the `tabContext` entry, calls
   `tabsStore.openTab` at the same index, publishes `tabChanged`, and points
   `dragObjects` at the new tab's list.
6. `maybeAttachSharedSession`: two or more users with access make the scene
   [collaborative](#real-time-collaboration).
7. `persistencyHandler.loadPersistedModel` → `importInstances()` registers the attribute
   and role instances, draws every class instance with its ports (a URDF mesh where the
   robotics import left one, its vizRep otherwise), then every relation. Afterwards it
   creates any scene-type attribute instances the scene is missing.
8. The palettes are initialised, `historyService.initScene` sets the undo floor (the
   scene as opened), the hybrid algorithms run, and `sceneInstanceMutated` announces the
   finished scene.

If anything throws, `snapshotService.rollbackSceneOpen()` puts back the engine fields
captured before the open, and the user gets an authorization alert. The rollback
restores `globalObject` only: it does not touch `tabsStore`, so a failure after step 5
leaves the two halves of the tab out of step.

### Tabs: two halves in lockstep

`globalObject.tabContext[i]` and `tabsStore.tabs[i]` describe the same tab **at the same
index**: the engine half holds the SceneInstance, its `THREE.Scene` and its pick list;
the store half holds what the tab bar renders. They must never drift, so there is a
**single mutation path**:

| Operation | Where |
|---|---|
| open | `instanceUtility.createTabContextSceneInstance` |
| select, rename, close | [views/layout/tabActions.ts](src/views/layout/tabActions.ts) |
| drop everything (sign-out) | `services/session-reset` |

Nothing else should assign `globalObject.selectedTab` or splice `tabContext`.

- **Switching** removes the selection box from the outgoing scene, sets `selectedTab`,
  publishes `tabChanged`, points the undo controls at the new scene, swaps
  `globalObject.scene` and `dragObjects`, re-initialises the palettes, and re-adds the
  shared helpers (pointer sphere, intersection plane, fresh transform controls) to the
  new scene.
- **Closing** goes in a fixed order: remove the tab's remote cursors and selection
  boxes, detach its shared session, splice `tabContext`, drop its undo history, let the
  **store** clamp the selection, then reconcile the engine to whatever index the store
  settled on (or to an empty scene if none is left).
- **Renaming** (`renameSceneInstance`) updates the engine's SceneInstance, the tree
  node and the tab label together, PATCHes when auto-save is on, reverts everywhere if
  the server refuses, and records an undo step only for the active scene, and only once
  the rename has stuck.
- **Known limitation:** shared sessions (and `collabStore`) are keyed by tab **index**.
  Closing a lower tab shifts later tabs down while their sessions keep the old key,
  which strands a still-open shared session.
- "No tab open" means `tabContext[selectedTab]` is `undefined`. `globalObject.selectedTab`
  starts at `0`, not `-1` (only `closeTab` and sign-out set `-1`), so guard on the entry
  rather than the index.

---

## Saving

The client **auto-saves**. [AutoSave.tsx](src/views/toolbar/AutoSave.tsx) runs a 5-second
interval and PATCHes the active scene when it has been flagged dirty. There are **two
dirty flags**, because a shared scene must only save what *this* client changed:

| Flag | Set for | Read by the loop when |
|---|---|---|
| `doSceneInstancePatch` | edits on a solo tab | the tab is not shared and auto-save is on |
| `doSceneInstancePatchLocal` | *local-origin* edits on a shared tab (a peer's update must never set it, or every client would PATCH the same change) | the tab is shared |

Use **`markActiveSceneDirty()`** from
[local-change-publisher.ts](src/resources/collaboration/local-change-publisher.ts); it
picks the right flag. The table dialog and `urdf-pose-service` set
`doSceneInstancePatch` directly instead. A shared tab's loop never reads that flag, so on
a shared tab those edits reach the server only when some other local change flags the
scene.

On a shared tab auto-save is forced on (the switch is disabled), and a pending change
under read-only access raises an alert instead of a save. Deletions do not wait for the
loop: `deletionHandler` calls the REST DELETE endpoints directly (when auto-save is on).
File ▸ Save Model / Ctrl+S opens [SaveAsDialog](src/views/dialogs/SaveAsDialog.tsx),
whose **Save to Database** saves at once and whose **Save to Textfile** downloads the
scene as JSON.

`persistencyHandler.persistSceneInstanceToDB()` is **one PATCH**. The server's PATCH is
an upsert, so a brand-new scene's first save needs no POST. On success it refreshes the
snapshot baseline. **A 403 means one of two things**, told apart by the server's message
text: missing edit rights on a shared scene, or a metamodel rule the scene breaks. Either
way the scene is restored to its last snapshot and **re-imported whole**, so the canvas
shows the server's state rather than the refused edit.

That rollback is expensive and disruptive: every object is pulled out of the THREE scene
and redrawn, and the selection is dropped. So the client **validates first**:

- [metamodel-constraints.ts](src/resources/services/metamodel-constraints.ts):
  `attributeValueMatchesRegex` uses gds's `value_matches_pattern`, the same verdict the
  server's rule engine reaches. `PlainAttributeRow.commit` and the table dialog's
  `commitCell` refuse a failing value *before* it touches the model, snap the field back
  and show the snackbar.
- [consistency-checker.ts](src/engine/consistency-checker.ts) does the same for relation
  ends.

---

## Undo/redo

Undo is scoped to the **active tab's SceneInstance**, one stack per open scene. The
state is in [historyStore.ts](src/resources/store/historyStore.ts) and everything with a
side effect is in [history-service.ts](src/resources/services/history-service.ts), with
the pure diff rules in [scene-diff.ts](src/resources/services/scene-diff.ts).

**Recording is generic.** A mutation site doesn't describe what it changed; it only says
"something happened". The service serializes the scene, compares the string with the
previous entry (identical means no step), and derives the **touched uuids** by diffing
the two. That is why coverage is total, with no per-action inverse to write: anything
that lands in the SceneInstance is picked up by the same code.

- Engine modules publish **`historyRecord`** on the bus. They must not import the
  service, which imports engine modules whose construction order `engine/index.ts` owns.
  Views call **`historyService.record(label, { coalesceKey })`** directly.
- **`afterTransformSync`**: a drag reaches the gds instance on a *later* frame (see
  [the render loop](#the-render-loop)), so for a transform the service first runs the
  coordinates-updater passes itself, then snapshots. Otherwise the step would record the
  pose from before the drag.
- **Coalescing:** steps with the same `coalesceKey` within 600 ms merge into one (a
  slider being dragged, a held arrow key). The as-opened baseline at index 0 is never
  merged into. Recording after an undo discards the redo branch. At most 50 entries per
  scene.
- Snapshots are stored as **JSON strings**, since a whole scene × 50 live deep clones
  per tab would be a lot of retained memory. Engine-only keys that don't survive JSON
  (`urdfVizRep`, an STL `ArrayBuffer`) are left out of every snapshot.

Where steps are recorded:

| Action | Where | Step shape |
|---|---|---|
| drop a class instance | interaction-handler | one step, after its ports and attributes exist |
| draw a relation | interaction-handler | **one** step for the whole line, bendpoints included, once both roles are set |
| delete (Delete key / toolbar) | `deletionHandler.onPressDelete` | **one** step for the whole cascade |
| drag with the gizmo | transform-control-events, on mouse-up | coalesced per object + mode |
| nudge with the arrow keys | useKeyboardShortcuts | coalesced per object |
| Position tab edit | PositionPanel | one step per commit |
| attribute value | `attributeModel.applyFieldChange` | coalesced per attribute |
| table cell / rows | TableAttributeDialog | per cell / per row change |
| rename the active scene | tabActions | only after the PATCH succeeded |
| URDF joint origin / slider | urdf-pose-service | coalesced per joint |

**Applying a step is not a snapshot restore.** Only the instances the step touched are
moved back. `diffScene(live, target, touched)` yields what to remove, change and add,
and everything else in the live scene is left alone. That is what keeps a
collaborator's concurrent edit out of your undo. The delta is then pushed through the
channels a normal edit uses:

- removals go through `deletionHandler` (relations first, so a class's cascade finds
  nothing left to take);
- changes go through `assignInPlace`, which **preserves object identity**: arrays are
  re-matched by uuid, because the engine's flat lists, the attribute window and the
  meshes all hold references into the graph. Transforms are applied to the meshes
  directly;
- additions are re-inserted (classes before relations) and drawn through the
  persistency handler's idempotent draw passes;
- then: `render = true`, `selectionStore.bump()`, `sceneInstanceMutated`, the
  equivalent Y.Doc deltas for peers, and the scene is **flagged dirty**, because
  otherwise the next auto-save would PATCH the undone state straight back.

A replay runs in the [draw lane](#the-draw-lane), and an `applying` flag keeps its own
mutations from being recorded as new steps.

**Local edits only.** Uuids a peer changed (reported on `remoteSceneInstanceChanged`) are
subtracted when a step's touched set is derived: their edits stay in the snapshots but
are never replayed. After a reconnect the history **restarts** from the freshly fetched
scene, since every stored step refers to an object graph that was just replaced.

**Controls.** The toolbar arrows use the exported selectors `selectCanUndo`,
`selectCanRedo`, `selectUndoLabel` and `selectRedoLabel`. They return booleans and
strings, so the toolbar re-renders only when availability or the tooltip changes, not
on every recorded step. The chords (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl/⌘+Y) go through
[`hasCommandModifier`](src/resources/util/platform.ts), shared with the metamodeling
client so both apps obey the same keys, and they **stand down while a text field has
focus**: Ctrl+Z in an attribute input undoes the typing, not the model. (Ctrl+S is the
exception, handled everywhere, and it accepts Ctrl or ⌘ on any platform.) The Edit ▸
Undo/Redo menu items are disabled placeholders.

---

## Real-time collaboration

**When a scene is shared.** When a scene is opened, `maybeAttachSharedSession` asks the
server for its access list; with **two or more** entries the tab gets a shared session.
The share dialog publishes `sceneAccessGranted`, so a tab already open is promoted the
moment it crosses that threshold. The caller's own access level (`read` / `edit` /
`delete`) decides whether the session is read-only.

**The session.** [shared-doc-service.ts](src/resources/collaboration/shared-doc-service.ts)
keeps one `SharedSession` per tab index: a `Y.Doc`, a `WebsocketProvider` connected to
`SYNC_URL` (room = the SceneInstance uuid, `?token=<jwt>` for auth) and its
`awareness`. The `SharedSession` object is authoritative for engine and service code
(`sharedDocService.forTab(i)`); `collabStore` mirrors it for React. In a dev build the
service is also reachable as `window.__sharedDocService`.

**The Y.Doc schema** is documented at the top of
[y-mapping.ts](src/resources/collaboration/y-mapping.ts): four top-level maps (`info`,
the scene's own `attribute_instances`, `class_instances`, `relationclasses_instances`).
Two encoding decisions carry weight:

- **Position is three keys** (`x`, `y`, `z` in a `Y.Map`), and each write carries only
  the axes that actually moved. Yjs merges per key, so two users dragging the same
  object along different axes each keep their own axis. Rewriting all three would turn
  that into whole-position last-writer-wins.
- **Rotation is one key** (a JSON quaternion). A component-wise blend of two unit
  quaternions isn't a rotation, and three.js doesn't normalize, so the mesh would shear.
  One key makes the merge atomic.

**Local → peers.** Mutation sites call **`publishLocalChange(…)`** from
[local-change-publisher.ts](src/resources/collaboration/local-change-publisher.ts)
(history-service has an equivalent `broadcast()` of its own). It
resolves the active tab's session, does nothing on a solo tab, **skips while a remote
update is being applied** (otherwise the edit would echo back to its sender), and writes
the delta tagged with the session's `localOrigin`. Callers: the interaction handler (new
instances and bendpoints), the deletion handler, the coordinates updater, the transform
events, the attribute window and the scene-attribute creation. Bendpoints are published
as class instances *when they are created*, ahead of the relation that references them,
the same classes-before-relations order the loader uses.

**Peers → local.** The service installs `observeDeep` observers on every map except
`info`. Transactions with our own origin are skipped; for the rest, `applyingRemote` is set
and y-mapping's `applyYDoc…ChangeToSceneInstance` mutates the gds objects and the meshes.
Then the service:

- sets `render = true` and asks for vizRep updates of every changed attribute;
- publishes `remoteClassInstanceAdded` / `remoteRelationInstanceAdded`, on which the
  persistency handler draws the newcomer (in the draw lane, with `selectedTab`
  temporarily switched to the update's tab and `current_class_instance` restored
  afterwards);
- bumps `selectionStore`, and drops the local selection if a peer deleted it;
- publishes `remoteSceneInstanceChanged`, so undo leaves those instances alone.

**What the Y.Doc does not carry.** Port instances (a class instance added by a peer
arrives with `port_instance = []`), table cells, and the scene's name and description
have no live representation, so peers don't see those edits until they load the scene
from the server again.

**Concurrent drags.** three's `TransformControls` recomputes an object's position from a
pointer-down snapshot and pins every axis it doesn't own, which would undo a peer's
merged value on the next pointer move. [drag-reconciler.ts](src/resources/collaboration/drag-reconciler.ts)
moves that baseline so the merge sticks, and the mouse-up re-asserts the axes you
dragged. It reaches into `_positionStart`, a field three 0.169 happens to expose; check it
when upgrading three.

**Presence** travels over awareness and is never persisted. Each client publishes
`user`, `access`, `cursor` and `selection`:

- `rayHelper.shootRay` broadcasts the cursor at most every 33 ms;
  `globalSelectedObject` publishes the selection.
- [RemoteCursorRenderer](src/resources/collaboration/remote-cursor-renderer.ts) and
  [RemoteSelectionRenderer](src/resources/collaboration/remote-selection-renderer.ts)
  (sharing the `AwarenessRenderer` base) draw one helper per peer. The animator
  refreshes them every frame so they follow moving objects, and their labels are
  sprites held at a constant on-screen size.
- [UserLegend](src/views/user-legend/UserLegend.tsx) renders a chip per participant from
  `collabStore`. `userColor(uuid)` hashes the uuid to an HSL colour, so every client
  paints a given user identically.

**Connection lifecycle.** While disconnected the session is forced **read-only** and a
banner explains why. On reconnect the service re-fetches the scene and the caller's
access over REST and publishes `sharedSceneReconnected`; SceneGroup re-imports the scene
from that fresh copy and the undo history restarts. Close codes from the sync server:

| Code | Meaning | What happens |
|---|---|---|
| 4401 | bad or expired JWT | alert, token cleared, page reloaded |
| 4403 | access revoked | `sceneAccessRevoked`, then an alert and the tab closes |
| 4500 | sync server unavailable | read-only with a banner; the provider keeps retrying |

---

## Session teardown: signing out

Signing out has to destroy the session, not just the token. Everything the session
built lives in module singletons that last as long as the **page**: `tabContext` (the
SceneInstances, their `THREE.Scene`s and the pick lists), `tabsStore`, the undo
histories, the websockets, the scene tree, the snapshots. `AppLayout` only stops
*rendering* the body. Before the teardown existed, the next user's sign-in re-rendered
the body over the previous user's session: their tabs came back, and because
`contextDragObjects` is the raycasters' pick list, their objects were not just visible
but selectable, draggable and deletable.

`authStore.logout()` clears the token and publishes `login: false`.
[session-reset.ts](src/resources/services/session-reset.ts) (armed by the side-effect
import in `main.tsx`) runs `resetSessionState()` synchronously inside that publish, in
an order that matters:

1. **Selection**: detach the gizmo and clear the selection first. The gizmo logs an
   error every frame while it is attached to a mesh that has left the scene graph.
2. **Collaboration**: remote cursors and boxes go while their sessions and scenes still
   exist; then every session (`detachAll()` iterates the session map, which also finds a
   session stranded by the index-keying above); then `collabStore`.
3. **Tabs and engine scene state**: `tabContext`, `selectedTab = -1`, a fresh empty
   scene, every engine list, the drawing pointers, `tabsStore`.
4. **Per-scene caches**: undo histories, snapshots.
5. **Scene tree and metamodel**: the tree, the scene types, the import buffers, the
   lazy-load cache (whose generation bump retires any fetch still in flight) and the
   file cache.
6. **UI**: the interaction mode (reset through the field, not `setState(0)`, which would
   touch controls that may not exist), the flags, `uiStore` (a dialog left open would
   otherwise act on the previous user's scene), and the log panel.

`logout()` publishes **before** it logs, so "User logged out" is written after the log
has been cleared rather than wiped by it. The bus also keeps `authStore` (and its
node-environment tests) out of the engine's import graph.

Unlike the metamodeling client, this is one module, not two. There the engine sits in a
lazily loaded chunk and its reset has to live with it; here the engine is loaded
eagerly anyway.

If you extend it, keep what `initiator.init()` built (cameras, controls, renderer,
plane, pointer sphere): `init` is memoized and never runs again.

---

## The views, walking down

### [TopNavBar.tsx](src/views/top-nav-bar/TopNavBar.tsx) and [Toolbar.tsx](src/views/toolbar/Toolbar.tsx)

TopNavBar's menus are data (`buildMenus`): an entry either opens a `uiStore` dialog or
runs an action. **File** is live (Save Model, Export Model as .json, Import Model, Import
Metamodel, Map file to SceneInstance, Export Open Models), as are **Algorithms** and
**Simulation** (Enter / Exit Simulation Mode). View, Edit, Diagram and Settings are
disabled placeholders, kept so the menu structure stays complete. The menu icons are
`<Icon>` ligatures from the Material Icons font that [index.html](index.html) loads.

The Toolbar row holds Logout, two inert zoom buttons, the auto-save switch
([AutoSave](src/views/toolbar/AutoSave.tsx), which also owns the 5 s save loop),
undo/redo, delete, [CameraToggle](src/views/toolbar/CameraToggle.tsx) (reset view,
2D/3D, gizmo mode; Rotate only appears in 3D) and the user legend.

AutoSave and UserLegend both answer "is the **active** tab shared?", so each subscribes
to two things: `collabStore.tabs` (a session attaching, detaching or changing) *and*
`tabsStore.selectedTab` (the user switching tabs). Drop either and the component keeps
showing the previous tab's state.

### [TabBar.tsx](src/views/layout/TabBar.tsx) and [StateWindow.tsx](src/views/state-window/StateWindow.tsx)

One MUI `Tab` per `tabsStore` entry. Selecting runs `switchToTab`, the ✕ runs
`closeTab`, and a right-click offers Rename, all through
[tabActions](#tabs-two-halves-in-lockstep). The ✕ stops propagation so MUI doesn't also
treat the click as "select". StateWindow shows the current mode (from `stateStore`), a
View Mode button and an Info button that blinks red ten times on mount to point new users
at the interaction help.

### [LeftNav.tsx](src/views/left-nav/LeftNav.tsx): scenes, palettes, model tree

Two tabs: **Scenes** ([SceneGroup](#the-scene-tree), plus the two palettes once a tab is
open) and **Model tree**. **Both panels stay mounted**, the inactive one hidden, so
SceneGroup's init effect and bus subscriptions are not torn down on every tab switch.

[ModelTree.tsx](src/views/model-tree/ModelTree.tsx) lists the open scene's objects
grouped by metaclass, with relations after the classes. Row labels come from the
standard Name attribute (`NAME_ATTRIBUTE_UUID`), with the metaclass name as fallback.
Clicking a row calls
`interactionHandler.selectInstanceByUuid(uuid, { focusCamera: true })`: the same
selection a canvas pick makes, plus a camera pan. It rebuilds, debounced to 50 ms, on the
channels that signal the scene's *contents* changed. Selection and
transforms are deliberately not triggers, because they fire constantly and change no
row. While hidden it only marks itself stale.

### [RightNav.tsx](src/views/right-nav/RightNav.tsx)

The attribute window, or the simulation window in SimulationMode, over the log window.
The simulation window is mounted **only** in that mode, so it rebuilds its sliders on
every entry rather than showing a stale list.

### The attribute window

[AttributeWindow.tsx](src/views/attribute-window/AttributeWindow.tsx) owns the React
state; [attributeModel.ts](src/views/attribute-window/attributeModel.ts) holds the logic
as plain functions, so it can be tested without rendering.

- `buildAttributeGroups()` resolves the selected mesh back to its class, port or
  relation instance and sorts its attribute instances (by the meta attribute's
  `sequence`) into **plain**, **table** and **reference** groups. **With nothing
  selected it shows the open scene's own attributes** (the scene type's), labelled
  "Scene".
- It rebuilds on `updateAttributeGui`, on `removeAttributeGui` (after a 10 ms delay,
  and as a re-derive rather than a clear, so the panel falls back to the scene), on
  `tabChanged`, on the upload channels, and whenever `selectionStore.revision` moves. A
  run id drops a slow rebuild that finishes after a newer one.
- [PlainAttributeRow.tsx](src/views/attribute-window/PlainAttributeRow.tsx) renders a
  text field, a slider or a dropdown (both driven by the meta attribute's `facets`,
  split on `|`), or an upload button. The branches are independent, not an if/else
  chain: a File attribute renders its text field *and* its buttons. Edits follow
  **commit-on-blur**: keystrokes change local state; blur, Enter, slider release or a
  dropdown pick validates and then calls `applyFieldChange`.
- **`applyFieldChange` is the reference implementation of "an edit"**: normalize the
  value, request a vizRep update, run the hybrid algorithms, `publishLocalChange`,
  `markActiveSceneDirty()`, record an undo step. Copy its shape for new kinds of edit.
- The **Position** tab ([PositionPanel.tsx](src/views/attribute-window/PositionPanel.tsx))
  edits a class or port instance's X/Y/Z. The *mesh* is the source of truth: a commit
  moves the mesh and lets the render loop write the position back, exactly as a drag
  would. Only a field you actually typed into is committed, since an untouched one can
  be stale.
- [TableAttributeDialog](src/views/attribute-window/TableAttributeDialog.tsx) is an
  editable grid built on gds's table helpers (`Instance_tables`), which hold the rules
  the server enforces. A column with `ui_component: "button"` holds a **nested** table:
  `uiStore` can express only one open `tableAttribute` dialog, so the outermost is
  store-driven and deeper levels are local state.
  [ReferenceAttributeDialog](src/views/attribute-window/ReferenceAttributeDialog.tsx)
  is **one dialog shared by every reference button**; the clicked attribute arrives on
  `openReferenceDialog`, and choosing a target creates the role instance that records
  the reference.

### [SimulationWindow.tsx](src/views/simulation-window/SimulationWindow.tsx)

In a Robotic system scene: one slider per Joint instance, with limits read from the
joint's `Limit` table. Moving a slider re-poses the cached URDF robot through
`urdfPoseService`. Rebuilds are coalesced through a 100 ms timer, because a delete
cascade fires `sceneInstanceMutated` many times. As with the attribute window, the maths
is in a plain module, [simulationModel.ts](src/views/simulation-window/simulationModel.ts).

### [LogWindow.tsx](src/views/log-window/LogWindow.tsx) and the snackbar

Everything outside React logs through
[`logger.log(value, status)`](src/resources/services/logger.ts), which prepends to
`logStore`. The **status is a Material Icons ligature name**: LogWindow renders it with
`<Icon>{entry.status}</Icon>`. The conventions are `"info"`, `"done"`, `"close"` (used
for detail lines) and `"error"`. Only `"error"` also raises the
[snackbar](src/views/common/AppSnackbar.tsx), so reserve it for things the user must
see.

### The dialogs

All live in [src/views/dialogs/](src/views/dialogs/), mounted once in AppLayout and
driven by `uiStore`:

| Dialog | Does |
|---|---|
| CreateNewScene | new empty SceneInstance of a chosen type (preselected from the tree), opened as a tab, saved at once when auto-save is on |
| SaveAs | Save to Database / Save to Textfile for the active scene. Its Name and Description fields write **straight into** the SceneInstance as you type, so Cancel doesn't revert them. |
| CopyScene | "Duplicate": [copySceneModel.ts](src/views/dialogs/copySceneModel.ts) serializes the scene and replaces **every uuid** by text replacement, so identities and cross-references change in one consistent pass (recursing into nested tables), then revives with `fromJS` and opens the copy |
| DeleteScene | confirmation, then DELETE. If the scene is open, its tab is closed next (a stale tab would re-create the scene through the auto-save upsert), and only then is the tree node removed. |
| ShareScene | the access list: add a user by username (404 → "User not found"), change or revoke a level (409 → "Cannot remove the last delete owner") |
| ImportModel / ImportMetamodel | read exported JSON into memory: scenes into the import buffer the tree folds in, scene types straight into `globalObject.sceneTypes` as well. Nothing is sent to the server; "Load to database" is an inert placeholder. |
| MapFromFile | a zipped URDF + meshes into the open Robotic system scene; the only place the client unzips |
| Algorithm | lists independent procedures and those assigned to the open scene type, and runs the chosen ones |
| UserInfo | interaction help per mode, the current one expanded; "Report Problem" is inert |
| LoadingWindow | a fake-progress bar while `uiStore.loading` is set |

---

## Performance: the rules that keep it fast

Most of the cost in this app sits in two places: the render loop, which runs every frame
of a drag over every object, and panels that render one row per item. The rules below
are the ones the code already follows; keep to them.

**1. Render only when asked.** The animator draws only when `globalObject.render` is
set, and the expensive per-frame passes run only when a transform actually changed.
Setting the flag is cheap, so set it when you mutate a mesh, but don't set it on a
timer: the 1 s heartbeat already exists.

**2. Index once per pass, never search per item.** The line-routing pass builds one
uuid → mesh map per frame instead of walking the scene per line (the code comment
records 80 lines over a 700-node scene costing over 100,000 node visits per frame). The
coordinates updater indexes instances by uuid once per pass. Line geometry is rebuilt
only when the route changed. Scratch vectors in the ray helper are reused, never
allocated per ray.

**3. Throttle anything a drag can trigger.** Transform write-backs log at most once per
instance per 500 ms; unthrottled, a two-second drag re-rendered the log panel over a
hundred times. Cursor broadcasts go out at most every 33 ms. The gizmo's `change` event
sets `objectScaled` (which re-routes every line) only during a real drag.

**4. Bursts become one render.** `logStore` caps at 500 entries and gives each an `id`.
LogWindow reads it through `useThrottledLogArray`, which coalesces a burst of log calls
(a URDF import logs thousands) into one re-render, and its rows are `memo`ized with
`sx` objects hoisted to module scope. Rows are keyed by `id`, never by index: entries
are *prepended*, so index keys would change every key on each new line. ModelTree (50 ms)
and SimulationWindow (100 ms) debounce their rebuilds for the same reason.

**5. Selectors return stable values.** A store selector that returns a fresh object on
every call re-renders its component on every store write. The history selectors return
booleans and strings; `LeftNav` subscribes to one boolean.

**6. Don't load what nobody asked for.** Scene instances are fetched per SceneType on
first expand, and only the reference dialog loads them all. Undo snapshots are compact
strings, capped at 50 per scene.

---

## Gotchas

- **Revive with gds `fromJS`, never the app's `plainToInstance`**, and keep `instanceof`
  working: this client depends on it (the opposite of the metamodeling client).
- **`current_class_instance` is not the selection.** Ask `globalSelectedObject`. If you
  write the pointer in order to draw, restore it afterwards.
- **Never `await runExclusive` inside the draw lane**, and never subscribe to the bus
  with an `async` callback.
- **Mark dirty through `markActiveSceneDirty()`**, and publish to peers through
  `publishLocalChange()`. Hand-setting one flag, or calling `applyLocalChangeToYDoc`
  without the `applyingRemote` check, fails silently.
- **Some edits are not live-synced**: ports, table cells, and the scene's name and
  description ([details](#real-time-collaboration)).
- **Shared sessions are keyed by tab index** (see the note in
  `views/layout/tabActions.ts`), which strands a session when a lower tab is closed.
- **The `graphic-context` and `expression-utility` method surfaces are an API** for code
  stored in the database. Keep unused methods, and keep their parameters in order.
- **VizRep refreshes key on substrings.** An attribute redraws its instance only if its
  meta name or uuid appears in the vizRep source, so renaming an attribute in the
  metamodel can silently stop the redraw.
- **The mode names and the log statuses are strings with meaning**: mode names are
  compared, and statuses are icon names.
- **Rename through the tab or tree context menu.** The SaveAs dialog's Name field
  changes the SceneInstance and nothing else: no tab label, no tree node, no undo step.
- **The Statechange rotation gate applies only to the x axis**
  (`engine/hybrid-algorithms/statechange-algorithms.ts`). It is deliberate; changing it
  changes what existing models do.
- **Inert on purpose:** the zoom buttons, the View / Edit / Diagram / Settings menus,
  "Report Problem", and the "Load to database" buttons. They are kept visible.
- **A stale comment**: [DeleteSceneDialog.tsx](src/views/dialogs/DeleteSceneDialog.tsx)
  says the persistency handler "falls back to POST on a 404". It no longer does; the
  PATCH is an upsert, which is why a stale tab would re-create a deleted scene.
- **three.js 0.169 specifics are load-bearing.** `TransformControls` is not an
  `Object3D` there, so `scene-initiator` retires old controls through `globalObject` and
  `disconnect()` (its `dispose()` throws); the drag reconciler reads `_positionStart`.
  Re-check both when upgrading three.
- **In tests, mock `@/engine/global-definition`** (or the `@/engine` barrel), along with
  anything that imports it transitively: it builds a `WebGLRenderer` at module scope.

---

## Build-time glue and configuration

[vite.config.ts](vite.config.ts) defines two path aliases, and **two more files need their
own copy**, because Vite, Vitest and `tsc` don't share resolution:
[vitest.config.ts](vitest.config.ts) and [tsconfig.json](tsconfig.json).

- `@` → `src`, so imports read `@/resources/...` instead of `../../..`.
- `@gds` → the sibling `../mmar-global-data-structure` repo. The shared DTOs are
  consumed **directly from source**, not installed from npm or copied.

[tsconfig.json](tsconfig.json) settings that look odd: `experimentalDecorators` is on and
`emitDecoratorMetadata` off ("by design", says the file) for the gds decorators, and
`strictPropertyInitialization` is off because several engine fields (the transform
controls, the canvas container, the `current_*` pointers) are only assigned after
construction.

Config is read in exactly one place, [src/config.ts](src/config.ts). Services import
`API_URL` / `SYNC_URL` from there and never touch `import.meta.env`. `VITE_USERNAME` /
`VITE_PASSWORD` optionally pre-fill the sign-in form in development. Keep `localhost`
in `.env` even with Docker: the **browser** runs on the host, where the in-container
hostnames `mmar-server` / `mmar-sync-server` do not resolve.

Scripts: `npm run dev` (port 8085), `build` (`tsc --noEmit && vite build`), `test`,
`typecheck`, `lint`. **Don't rename `start` / `start:prod`**: Docker's
`start-node-modeling-client-react.sh` calls them.

## Tests

`npm run test` → **707 tests across 76 files, all green** (22 September 2026, with
`mmar-server` and `mmar-sync-server` reachable). Vitest defaults to the `node`
environment; component suites opt into jsdom per file with a
`// @vitest-environment jsdom` docblock. [src/test-setup.ts](src/test-setup.ts) imports `reflect-metadata` first
(mirroring `main.tsx`) and polyfills `Blob.text()` / `arrayBuffer()`, which jsdom lacks.
Without that polyfill, a file import fails *inside* a try/catch and looks like an empty
import rather than an error. The "Not implemented: HTMLCanvasElement's getContext()"
line in the output is expected: label sprites guard their canvas work.

The seven `*.integration.test.ts` suites (13 tests) hit the live servers and
`describe.skipIf` themselves when the servers are unreachable. They are why
`testTimeout` is 60 s: the in-container `GET metamodel/sceneTypes` payload alone is
around 29 MB.

The suites worth reading before you change something:

| Area | Suites |
|---|---|
| engine mount contract | [engine-lifecycle.test.ts](src/engine/engine-lifecycle.test.ts) (12) |
| undo/redo | [history-service.test.ts](src/resources/services/history-service.test.ts) (25), [scene-diff.test.ts](src/resources/services/scene-diff.test.ts) (23), [historyStore.test.ts](src/resources/store/historyStore.test.ts) (16) |
| collaboration | [y-mapping.test.ts](src/resources/collaboration/y-mapping.test.ts) (37), [shared-doc-service.test.ts](src/resources/collaboration/shared-doc-service.test.ts) (34), [drag-reconciler.test.ts](src/resources/collaboration/drag-reconciler.test.ts) (7) |
| tabs and the tree | [tabActions.test.ts](src/views/layout/tabActions.test.ts) (19), [SceneGroup.test.tsx](src/views/scenegroup/SceneGroup.test.tsx) (28) |
| teardown | [session-reset.test.ts](src/resources/services/session-reset.test.ts) (11) |
| saving and validation | [persistency-handler.test.ts](src/resources/services/persistency-handler.test.ts) (12), [metamodel-constraints.test.ts](src/resources/services/metamodel-constraints.test.ts) (10) |
| deletion cascade | [deletion-handler.test.ts](src/engine/deletion-handler.test.ts) (12) |
| vizRep refresh and the lane | [vizrep-update-checker.test.ts](src/engine/vizrep-update-checker.test.ts) (16), [draw-lock.test.ts](src/resources/services/draw-lock.test.ts) (4) |
| attribute window | [attributeModel.test.ts](src/views/attribute-window/attributeModel.test.ts) (22), [AttributeWindow.test.tsx](src/views/attribute-window/AttributeWindow.test.tsx) (19) |

Many of these exist because the rule they pin was a bug first.

---

## The one mental model to keep

The engine owns the model and mutates it in place; React renders mirrors of it. So
**every change has to announce itself**, and each announcement goes to a different
audience:

```
User clicks the canvas / edits a field / presses a key
        │
        ▼
engine handler or view mutates the gds SceneInstance (and its meshes) IN PLACE
        │
        ├─▶ globalObject.render = true            → the animator draws the next frame
        ├─▶ checkForVizRepUpdate…                 → instances whose vizRep reads the value redraw
        ├─▶ publishLocalChange(…)                 → peers see it (shared tab only)
        ├─▶ markActiveSceneDirty()                → auto-save PATCHes it within 5 s
        ├─▶ historyRecord / historyService.record → it becomes an undo step
        └─▶ a push into a Zustand mirror          → React re-renders
            (selectionStore.bump, stateStore, tabsStore, …)
```

A new kind of edit that forgets one of these fails silently: it doesn't redraw, never
reaches the peers, is lost on reload, can't be undone, or leaves a panel stale.
[`applyFieldChange`](src/views/attribute-window/attributeModel.ts) is the model to copy.
If you internalize "**the engine mutates, then announces; React only listens**", the rest
of the file structure is regions of UI hanging off that loop.
