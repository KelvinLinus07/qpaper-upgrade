# Enlarge question paper preview (frontend-only update)

## What changed
- The live preview header now has an **Enlarge** button next to **PDF**.
- Enlarge opens a full-window, read-only dialog containing the same `Preview` component as the sidebar.
- The A4 page scales to the available width without reflowing its paper table layout.
- **Print / Save PDF** uses the existing `PrintOverlay` and native browser print flow.
- Exit with **Close**, **Escape**, or by clicking outside the page dialog.
- The dialog works in both desktop and mobile preview tabs. Closing it keeps the in-progress editor state intact.
- No API, database schema, login, S3/R2 settings, `.env`, or migrations were modified.

## Update a running EC2 Docker deployment

From your local computer, upload `qpaper-studio-enlarge-preview-patch.zip`:

```bash
scp -i kela-quest.pem qpaper-studio-enlarge-preview-patch.zip ubuntu@YOUR_EC2_IP:/home/ubuntu/
```

Then on EC2:

```bash
cd /home/ubuntu/deploy
cp src/App.jsx src/App.jsx.before-enlarge
unzip -o /home/ubuntu/qpaper-studio-enlarge-preview-patch.zip -d /home/ubuntu/deploy
docker compose up -d --no-deps --build web
docker compose ps
```

Hard-refresh the browser (Ctrl+Shift+R). No `migrate`, `seed`, API restart, or new packages are required.

The patch archive paths are relative to `/home/ubuntu/deploy` and include `src/App.jsx`, `src/components/Preview.jsx`, `src/components/FullscreenPreview.jsx`, `src/fullscreen-preview.css`, and this document.

## Quick verification
1. Open Builder and create or load a paper.
2. Confirm **Enlarge** appears beside **PDF** in the Live Preview heading.
3. Open Enlarge; verify question numbering, images, formulas, section headings, and A4 proportions.
4. Close with the Close button and Escape. Ensure unsaved editor text remains.
5. Re-open Enlarge and choose Print / Save PDF. Confirm the previous PDF print dialog is used.
6. Repeat on a narrow/mobile viewport using the **Preview** tab.

## Notes
The preview opens at up to the actual A4 CSS page width. It scales down on narrow screens; browser print rendering is unchanged. Printing still depends on browser settings and available fonts.
