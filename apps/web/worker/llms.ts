export const llmsTxt = `# Post Writer

Send a handwritten Supernote note to another person on the tailnet. The pony
express for ink: the sender's Supernote plugin serialises the open note (strokes and
text boxes, page by page), the recipient checks their inbox and pulls it, and
the note is rebuilt in their device's INBOX folder.

Identity is the tailnet user (mf platform, env.TAILNET). There is no login,
no token, no signup: opening the plugin once registers you as a recipient.

## API (JSON, all under /api, all require tailnet identity)

- GET  /api/me                       -> { login, name }
- GET  /api/users                    -> [{ login, name, last_seen }]  (everyone except you)
- POST /api/send                     { id, to, note } -> { id, created: bool }
                                     idempotent on the client-supplied id
- GET  /api/inbox                    -> undelivered messages for you (metadata only)
- GET  /api/inbox/:id                -> the note document
- POST /api/inbox/:id/delivered      -> { status: delivered | already }
                                     call only after the note is written on-device
- GET  /api/sent                     -> your last 100 sent messages, with delivered_at

## Note document (v1)

{ v: 1, title, isPortrait, emr: { width, height },
  pages: [{ elements: [
    { kind: "stroke", layer, penColor, penType, thickness, pts: [x0,y0,x1,y1,...] in 0..1, prs?: [...] },
    { kind: "text", layer, text, fontSize, rect: { left, top, right, bottom } in 0..1, textAlign, textFrameWidthType }
  ] }] }

Max 20 MB per note.

## Pages

- /                  landing page: what it is, how to install and use the plugin
- /postwriter.snplg  the current plugin package (copy to the Supernote's MyStyle folder)
- /inbox             your inbox, sent notes and people (browser view)

Source: https://github.com/polvi/postwriter (apps/web is this worker, plugin/ is the Supernote plugin).
`;
