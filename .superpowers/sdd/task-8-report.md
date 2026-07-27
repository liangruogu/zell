# Task 8 Report: Desktop sync — push data to server on publish changes

**Status:** Done
**Date:** 2026-07-27

## Commit
- `060bee7` — `feat: sync publish data to server on changes`
- File: `app/src/components/project/PublishSettings.tsx` (+49, -1)

## Changes
Added a `useEffect` in `PublishSettings` component that syncs publish config, article content, and whiteboard snapshots to the Go server via PUT requests when:
- A project is selected (`currentProject`)
- The sync server is configured (`serverUrl`)
- The connection is established (`connected`)
- Publish settings change (`publish.enabled` in the dependency array)

Syncs data to three endpoints:
- `PUT /api/v1/projects/:pid/publish` — publish config JSON
- `PUT /api/v1/projects/:pid/publish/articles/:aid` — each selected article's content
- `PUT /api/v1/projects/:pid/publish/whiteboards/:wid` — each selected whiteboard snapshot (ppt, ui, mood)

## Lint
- `pnpm run lint` — no new errors introduced. 252 pre-existing errors/warnings remain unrelated to this change.
