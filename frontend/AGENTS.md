# AGENTS.md - Frontend

## Project Purpose

Minepanel frontend is a Next.js dashboard for managing Minecraft servers.

- Creates and edits server configuration.
- Controls runtime actions (start, stop, restart, logs, worlds, files, settings).
- Supports both Java and Bedrock UX paths.

## Architecture

```txt
frontend/src/
|- app/                         App Router pages
|  |- dashboard/
|  |  |- servers/[server]/      Server config/details route
|  |  |- files/                 Global files browser route
|  |  |- world-library/         Global world library route
|- components/
|  |- organisms/                Complex feature sections
|  |- molecules/                Mid-level reusable UI
|  |- ui/                       Base shadcn primitives (generated)
|- services/
|  |- axios.service.ts          Shared API client config
|  |- docker/                   Server lifecycle/config endpoints
|  |- files/                    File browser endpoints
|  |- world-discovery/          World import endpoints
|  |- metrics/                  Per-server CPU/RAM history endpoints
|  |- scheduler/                Scheduled tasks CRUD endpoints
|  |- audit/                    Audit log query endpoint
|- lib/
|  |- store/                    Zustand stores
|  |- translations/             i18n dictionaries
|  |- hooks/                    Custom hooks
|  |- sse-client.ts             fetch + ReadableStream SSE consumer
```

Backend integration model:

- Frontend never accesses host filesystem directly.
- Files and worlds are always mediated by backend endpoints.
- Route `serverId` values are API-level identifiers with special cases (`_root`, `.world`).

## Key Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
```

From repo root:

```bash
npm run dev --prefix frontend
npm run lint --prefix frontend
```

## Code Patterns

- Prefer server components by default; use client components when state/effects/browser APIs are required.
- Keep API calls in `src/services/*`; do not scatter ad-hoc fetch calls across UI.
- Reuse `src/services/axios.service.ts` for auth/session behavior.
- Keep components focused; split large feature blocks into molecules/organisms.
- Maintain existing visual/system patterns; do not redesign unrelated UI.

Design system (Minecraft GUI):

- The app uses a pixel/inventory "Minecraft GUI" look defined in `src/app/globals.css`.
- Panels/windows: `mc-panel` (beveled stone window) + `mc-titlebar` (header strip). Inventory
  slots: `mc-slot` / `mc-slot--active`. Buttons: `mc-btn` (+ `-emerald` `-lapis` `-gold` `-amethyst`).
  Segmented bars: `mc-bar` + `mc-bar__fill` (set fill color via inline `backgroundColor`).
  Status chips: `mc-tag`. Inputs: `mc-input`.
- The base shadcn primitives are skinned to this look via helper classes so feature UI inherits it
  automatically: `Card` uses `mc-panel`; `Button` uses `mc-bevel` + `font-minecraft`; `Input` uses
  `mc-field`; `Badge` uses `mc-chip`; `Tabs` list/trigger are squared with emerald active state.
  Prefer plain `Card`/`Button`/`Input`/`Badge`/`Tabs` and let the skin apply; only reach for the raw
  `mc-*` classes for bespoke layouts (dashboards, headers).
- Use the existing pixel item art in `public/images/*.webp` with the `pixelated` class for icons.

Auth/session patterns:

- Axios client uses `withCredentials: true`; preserve it.
- Keep browser auth in `httpOnly` cookies; do not introduce token storage in `localStorage` or append JWTs to URLs.
- SSO: `getSetupStatus()` returns an optional `sso` field; the login page (`app/page.tsx`) shows a "Sign in with {provider}" button and, when `sso.passwordLoginDisabled`, hides the password form. SSO starts via `startSsoLogin()` (top-level navigation to the backend `/auth/oidc/login`, not axios). A `?ssoError=1` query shows a toast.

Java/Bedrock UI parity:

- Preserve edition-aware behavior in tabs and settings.
- Do not expose Java-only controls for Bedrock by mistake (proxy/RCON-specific behavior).

Tooling / build (Next.js 16):

- Turbopack is the default bundler for `next dev` and `next build`. `next.config.ts`
  uses a `turbopack` block; do not reintroduce a `webpack` config (it errors under Turbopack).
- `next lint` was removed. The `lint` script is `eslint src`, using the flat config
  exported by `eslint-config-next` in `eslint.config.mjs`.
- The React Compiler `react-hooks/*` rules shipped by eslint-config-next 16 are
  disabled in `eslint.config.mjs` to preserve the pre-upgrade baseline; revisit as a
  dedicated cleanup, not inside unrelated changes.

## Critical Files

- `src/services/axios.service.ts` - baseURL and credential behavior.
- `src/services/docker/fetchs.ts` - core server API calls.
- `src/services/files/files.service.ts` - files API contract.
- `src/services/audit/audit.service.ts` - audit log query (admin/manageUsers).
- `src/lib/sse-client.ts` - cross-origin SSE consumer (fetch + ReadableStream with `credentials: 'include'`).
- `src/lib/hooks/useServerLogs.tsx` - logs hook; opens SSE for live tail, falls back to REST polling.
- `src/lib/hooks/useServerMetricsStream.ts` - metrics hook; SSE appends live points to history buffer.
- `src/components/molecules/FileBrowser/FileBrowser.tsx` - file management UX and upload/download behavior.
- `src/app/dashboard/files/page.tsx` - global file browser entry (`_root`).
- `src/app/dashboard/world-library/page.tsx` - world library entry (`.world`).
- `src/app/dashboard/servers/[server]/page.tsx` - dynamic server route binding.
- `src/components/molecules/Tabs/ServerTypeTab.tsx`
- `src/components/molecules/Tabs/BedrockSettingsTab.tsx`
- `src/components/organisms/ServerConfigTabs.tsx` - server view content. Owns the single tab metadata source + command-palette index (`paletteItems`); publishes the tab list/active tab to the global sidebar via `server-nav-store`.
- `src/components/organisms/Sidebar.tsx` - global sidebar; drills into a per-server tab nav when on `/dashboard/servers/[server]` (back button + grouped tabs), otherwise shows the base navigation.
- `src/components/organisms/SidebarServerNav.tsx` - server tab nav rendered inside the sidebar drill-in (grouped config/operation/monitoring, filter input + `TabSearch` palette); selecting a tab sets the URL hash.
- `src/lib/store/server-nav-store.ts` - shares the active server's tab list and active tab between the server page and the global sidebar.
- `src/components/organisms/TabSearch.tsx` - command palette (Ctrl/Cmd+K) to jump to tabs and settings.
- `src/components/molecules/Tabs/MetricsTab.tsx` - per-server CPU/RAM history chart (live SSE tail).
- `src/components/molecules/Tabs/LogsTab.tsx` - logs viewer; consumes `useServerLogs` so SSE updates flow through transparently.
- `src/components/molecules/Tabs/ScheduledTasksTab.tsx` - scheduled tasks CRUD.
- `src/lib/store/servers-store.ts`
- `src/lib/translations/index.ts` and language files (`en.ts`, `es.ts`, `nl.ts`, `de.ts`, `fr.ts`, `pl.ts`)
- `eslint.config.mjs` - flat ESLint config (eslint-config-next 16).
- `next.config.ts` - Turbopack config, standalone output, image/compiler options.
- `package.json`

## Agent-Specific Instructions

General:

- Read root `AGENTS.md` before frontend edits.
- Do not add new state/API libraries unless explicitly required.
- If backend API contracts change, sync frontend services and update docs in `doc/`.

Path and serverId semantics (important):

- `serverId="_root"` means "all servers root" in files UI (maps backend to `/app/servers`).
- `serverId=".world"` means global world library (maps backend to `/app/servers/.world/worlds`).
- Any normal server ID maps to that server data directory in backend files module.
- Do not normalize or rewrite these IDs on frontend; pass them exactly as expected by backend.

File browser and uploads:

- Keep current upload semantics (`path` + optional `relativePath(s)`) because backend preserves folder structures using these fields.
- Keep encoding and query parameter usage stable for download URLs.
- Avoid frontend-side path sanitization that can conflict with backend path validation rules.

Routing and data flow:

- `dashboard/servers/[server]` route param is the source of truth for selected server ID.
- Keep service hooks (`useServerConfig`, `useServerStatus`) aligned with API endpoints.
- Do not move API logic into presentation components.

i18n:

- Any new user-facing key must be added to all active dictionaries (`en`, `es`, `nl`, `de`, `fr`, `pl`).
- Keep key naming consistent; avoid one-off names that break translation structure.

SSE / live streams:

- Use `frontend/src/lib/sse-client.ts` (`openSse<T>(path, options)`) instead
  of the native `EventSource`. The native API is locked to `same-origin`
  credentials mode, which breaks the HttpOnly JWT cookie when the dev server
  runs on `:3000` and the API on `:8091`. The SSE client uses
  `fetch(url, { credentials: 'include' })` so the cookie always reaches the
  backend.
- Reconnects use exponential backoff with jitter (`1s → 30s` cap, see
  `baseReconnectMs` / `maxReconnectMs`). The client remembers the last
  `id:` it received per backend `MessageEvent` and resends it as
  `since=<id>` on the next connection so the server can resume the cursor.
- The handle exposes `status` (`'connecting' | 'open' | 'reconnecting' | 'closed'`)
  and `reconnectAttempt` for UI indicators like `components/molecules/LiveIndicator.tsx`.
- Hooks that consume SSE must own an `AbortController` ref keyed on
  `serverId` / `[serverId, hours, etc.]` so navigating between servers
  aborts the previous stream before opening the next one. Use a
  `activeServerRef` ref compared against the closure's `serverId` so
  late-arriving payloads from a previous connection can't leak into the
  next server's buffer.
- `useServerLogs` runs **both** an initial REST `fetchLogs()` and opens
  the SSE connection on every `[serverId]` change. The REST call is a
  safety net: if the SSE immediately emits `terminal: container_gone`
  because the container is mid-startup, the user still sees a snapshot
  instead of a stranded error. Once the SSE starts delivering real
  ticks the content `Set` deduplicates them against the REST snapshot.
  The SSE then owns the live tail on top of that snapshot.
- `logEntries` IDs are stable FNV-1a hashes of the line content (see
  `hashContent` in `useServerLogs.tsx`). React keys therefore never
  churn across SSE ticks; duplicates are filtered by a content `Set`
  in `parseLogsToEntries`. Do NOT switch back to `Date.now()-index`
  ids — that's the regression that made the logs list "rerender itself"
  every 1.5 s even with no new content.
- `startRealTimeUpdates` does not guard against an existing handle.
  `startStream` self-cleans via `stopStream` first, so calling it again
  is always safe (and required after a `terminal` frame leaves the refs
  null). Don't reintroduce the `if (sseHandleRef.current) return` bail.
- On a `terminal: container_gone` frame the hook **does NOT** call
  `stopStream()` unless `serverStatus ∈ {stopped, not_found, stopping}`.
  This lets the `sse-client.ts` reconnect loop (exponential backoff,
  see below) reattach once the container is up. When the user-driven
  state flips from stopped → alive, the `[serverStatus]` effect
  additionally calls `startRealTimeUpdates` for an immediate reattach
  instead of waiting for the next backoff tick.
- The logs section shows the streaming status in **exactly one place**:
  the footer text ("Real time active" / "paused" / "with errors" /
  "disconnected"). Do NOT add a second indicator such as a "LIVE" pill
  in the title bar or a `<LiveIndicator>` chip in the toolbar; both
  were removed because they duplicated the footer and one of them
  (`LiveIndicator`) said "Live" instead of the user-preferred "active".
- `useServerMetricsStream` returns `{ history, livePoints, combinedPoints, status, error, refresh }`
  and filters null CPU/memory points out of `combinedPoints` so a
  `stopped` / not-yet-discovered container doesn't paint `0%` on the chart.

UI base components:

- Do not edit autogenerated base components in `src/components/ui/*` unless explicitly requested.
- Extend behavior through wrappers/composition in feature components.

## Required AGENTS.md Content

Every frontend AGENTS update must include:

- Project purpose
- Architecture
- Key commands
- Code patterns
- Critical files
- Specific agent instructions
- Context Maintenance Rule

## Writing Tips (Mandatory)

- Be explicit and concrete.
- Reference exact files for sensitive flows (auth, files, worlds, route params).
- Keep only relevant context.
- Iterate and tighten rules based on recurring mistakes.

## Context Maintenance (Golden Rule)

The agent must keep `frontend/AGENTS.md` and `frontend/README.md` updated whenever frontend workflow, architecture, commands, or conventions change.
