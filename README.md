# Semester — self-hosted student calendar + tasks

A self-hosted calendar and task manager built for a class schedule: per-class
calendars, projects with nested sub-projects, recurring tasks with streak
tracking, and a Google-Calendar-style week view.

## Stack

- **Vite + React 18 + TypeScript** — no other runtime dependencies
- State: React context + reducer ([src/store.tsx](src/store.tsx))
- Persistence: localStorage behind an adapter ([src/api/storage.ts](src/api/storage.ts))

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ — host anywhere
```

The production build is a static site: serve `dist/` from any web server
(nginx, Caddy, a Raspberry Pi…). All data currently lives in the browser's
localStorage.

## What works today

- **Calendar**: day / week / month views; click an empty slot to create an
  event; click an event to edit or delete; daily/weekly repeating events;
  all-day lane; semi-transparent event bodies so hour lines stay visible;
  red now-line + highlighted today column/date.
- **Per-class calendars**: each class has a color and a visibility toggle in
  the left sidebar (plus a Personal calendar and a Tasks layer toggle).
  Adding a class auto-creates a matching project.
- **Mini month** in the sidebar with today marker and colored dots for
  events/tasks on each day.
- **Tasks**: sidebar panel on the calendar page (expandable to a full page),
  grouped by Overdue/Today/Tomorrow/This week/Later/Someday or by Projects.
  Tasks can be scheduled (date, optional time) or left undated in a project's
  braindump. Scheduled tasks appear on the calendar with a checkbox and get
  struck through when completed.
- **Projects**: collapsible, nestable (including under class projects),
  completion ring indicator, quick-add braindump input, recurring tasks
  (daily / weekdays / weekly) with optional streak counter + 7-day habit
  tracker strip.
- **Light/dark mode** toggle (persisted).

## Roadmap / placeholders

The seams for the next passes are marked with `TODO` comments:

- **Backend**: swap [src/api/storage.ts](src/api/storage.ts) for a REST
  server (Express + SQLite suggested) — it is the only module that touches
  persistence. Then: multi-device sync, auth.
- **Reminders/notifications** (6h/1h/5m before): needs a service worker or
  server process; the data model has room for it.
- **Recurrence exceptions**: editing/deleting a single occurrence of a
  repeating event, series end dates ([src/types.ts](src/types.ts)).
- **Drag & drop**: dragging events/tasks between slots on the grid.
- **Share schedule**: read-only share links (needs the backend).
