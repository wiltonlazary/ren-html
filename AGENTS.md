# ren-html

Read the workspace layer first: [`../../../AGENTS.md`](https://github.com/wiltonlazary/rui/blob/main/AGENTS.md) and
[`../../../.ai/config/`](https://github.com/wiltonlazary/rui/tree/main/.ai/config) (stability.md first). Then [README.md](README.md).

ren-html is a server-side render of ren-core views (no hydration). It consumes only
public entries (`ren-core`, `ren-dom`). Its exports are locked by
`test/exports.lock.json`; it changes only for a defect, or when the user
asks. Install rrx-core, ren-core, ren-canv and ren-dom first, in that order.
