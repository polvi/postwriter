# notedrop

An inbox for ink. Write a note on your Supernote, send it to someone else on
the tailnet, and they pull it onto their own device. No accounts: the sender
is whoever the tailnet says is holding the device.

```
Supernote (plugin) ──HTTPS over tailnet──▶ notedrop.tailb55c1.ts.net (mf worker, Hono + D1)
   Send: open note → elements → JSON        POST /api/send   {id, to, note}
   Inbox: list → Pull → rebuild .note        GET  /api/inbox  · GET /api/inbox/:id
          in /storage/emulated/0/INBOX/      POST /api/inbox/:id/delivered (after the write)
```

- **Identity** comes from `env.TAILNET.identity(request)` on the mf platform
  (`apps/web/worker/auth.ts`). Opening the plugin once registers you as a
  recipient; the "Send to" list is everyone who has done that.
- **What travels** is not the `.note` file. The Supernote SDK exposes note
  content only as per-page elements (strokes with points and pressure, text
  boxes), so the plugin serialises those with geometry normalised to 0..1
  (`plugin/src/transfer.ts`, format in `apps/web/worker/note-format.ts`) and
  the recipient's plugin recreates them with `createNote` / `insertNotePage`
  / `insertElements`. Pen type, colour, thickness, pressure, layers and text
  boxes survive; templates, links, titles and images do not (yet).
- **Delivery** is write-then-ack. The plugin only reports `delivered` after
  the note is on disk, and the server's ack is one conditional UPDATE, so a
  crash mid-pull retries and a duplicate ack is a no-op. Model-checked in
  `specs/Inbox.tla`.
- **Sending to yourself** is allowed: it is how a one-device setup is tested,
  and it doubles as "copy this note into INBOX".

## Service (`apps/web`)

Tailnet-only, deployed to mf. There is no Cloudflare deployment because the
identity model needs the tailnet.

```sh
bun install
bun run test            # note-format validation
bun run deploy          # bun run configure + wrangler deploy --env procdev + migrations
curl https://notedrop.tailb55c1.ts.net/api/me
```

`deploy.sh` refuses to run unless `CLOUDFLARE_API_BASE_URL` points at mf.
Note bodies are stored in D1 (`note_bodies`), not R2: wrangler's R2 bucket
check has no route on mf and aborts the deploy. The D1 id is pinned in
`stack.config.jsonc` (`d1.notedrop`); mf keys state by that id.

A small status page lives at `/` (inbox, sent, people) and the API is
described at `/llms.txt`.

## Plugin (`plugin`)

React Native 0.79.2 + `sn-plugin-lib`, packaged as `build/outputs/notedrop.snplg`.

```sh
cd plugin && bun install
bash buildPlugin.sh              # bundle + PluginConfig.json + icon → .snplg
bash scripts/deploy.sh           # adb push + UI-automated install (first time / upgrades)
bash scripts/hotreload.sh --build  # swap the JS bundle in place (iteration)
bash scripts/logs.sh             # logcat, the only debugging channel
```

Device: `SNPLG_DEVICE=host:5555` (defaults to the Nomad on the tailnet).
Tailscale must be running on the Supernote; the plugin talks to the ts.net
hostname directly (PluginHost blocks cleartext HTTP, and the plugin runtime
has no working timers, so refreshes are manual).

On the device: open a note → sidebar puzzle icon → **notedrop**. The Send
tab lists recipients; the Inbox tab lists what is waiting, with Pull / Pull all.

### Firmware notes

Tested on a Manta (A5X2; `ro.product.model` misreports it as a Nomad).

- **Plugin-preview firmware** (Chauvet beta 2608241001, PluginHost
  1.00.2608211): permissions are enforced at the process boundary. The plugin
  requests `INTERNET`, `FILE:READ`, `FILE:WRITE` when the view opens; pick
  **Always Allow** or the grant is revoked when the view closes. The manifest
  is parsed only at `.snplg` install, so a permission added to
  `PluginConfig.json` needs `scripts/deploy.sh`, not a hot reload. `openFile`
  works here, so a pulled note opens on screen. The lifecycle listener
  refreshes the note path and inbox each time the view is shown.
- **Earlier firmware** (PluginHost 1.00.26005190): `hasPermission`,
  `requestPermission` and `openFile` have no native implementation. The
  plugin treats a missing permission API as "no permission system" and
  `openFile` as best-effort ("Open it from Files › INBOX").
- Page indices for `getElements` / `getPageSize` / `insertElements` are
  0-based on both (the 1-indexing change in the preview release covers
  `numInPage` and the `*PageElements` family, which notedrop does not use).
- `createNote` needs an absolute `/storage/emulated/0/...` path and there is
  no mkdir, so pulled notes are flat files in `INBOX/`:
  `<sender>-<title>-<yyyymmdd-hhmmss>.note`.
- `pluginID` (`notedrop00000001`) must never change: reinstalling the same
  id is an in-place upgrade.
- The plugin's icon does not currently render in the in-note Plugins menu
  (the Sticker plugin's does); the entry still works.
- The **Diag** button in the header runs `src/probe.ts`: permissions, page
  index base, and which SDK methods exist, to logcat and the status line.

## Not yet

End-to-end encryption (register a public key with the user row, seal the
note body to the recipient; the server already treats the body as opaque),
byte-exact `.note` transfer (needs a Java TurboModule), push/notification of
new mail (no background execution in plugins).
