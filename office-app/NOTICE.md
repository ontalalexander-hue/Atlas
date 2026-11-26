# Atlas Office

This folder is the source of the 3D office page served at `/office/`.

It is adapted from **Agent Office 3D** (https://github.com/GENERAL009/Agent-Office), used under the MIT license (see `LICENSE`).
Changes for Atlas: the page reads its events from Atlas (`/api/office/events`) instead of a local plugin server, it starts in Live mode with the Atlas team, and it calls no outside service.

Build: `npm install && npm run build` here. The result is written to `src/public/office/` and committed.
