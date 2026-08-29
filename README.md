# Text AI (Raycast local extension)

Replaces the two Raycast Pro AI Commands that were actually being used: translate the
selection, and fix the grammar of the selection.

Both open a Raycast window showing the result, and let you keep asking about it. Nothing
is written back until you choose an action, so a bad result costs one Escape.

The window is a list of turns: the original selection, the result, then any follow-up you
ask. Highlight a turn to read it in full on the right.

| Search bar | Enter | Cmd+Enter | Cmd+Shift+C |
|---|---|---|---|
| empty | paste the highlighted turn | paste | copy |
| you typed a question | send the follow-up | paste the highlighted turn | copy |

Paste and Copy always act on the **highlighted** turn, so a revision produced by a
follow-up is just as pasteable as the first result. They carry the raw string, so the
Markdown rendering in the window never changes what gets written.

Runs on the Raycast **free** tier. Script Commands and locally developed extensions are
not gated behind Pro; only the built-in AI Commands, Cloud Sync, and custom themes are.

## Commands

| Command | What it does |
|---|---|
| `Translate Selection` | Chinese goes to English, anything else goes to Traditional Chinese (Taiwan). Auto-detects direction. |
| `Polish English Selection` | Grammar and phrasing only. Keeps the author's tone, does not inflate into corporate English. |

Both are `view` mode: they show the result rather than replacing text silently.

**Turn 1 vs follow-ups.** The first turn runs under a strict prompt (`TRANSLATE_PROMPT` /
`POLISH_PROMPT` in `src/prompts.ts`) that forbids commentary, which is what keeps the
result paste-ready. Follow-ups run under `FOLLOWUP_PROMPT` over the same history, so they
can explain and revise. Editing the strict prompts changes tested behaviour: re-run your
own samples before shipping such a change.

Both leave technical terms, identifiers, paths, URLs, and CLI commands untouched, and
preserve line breaks and Markdown.

## Setup

1. **Get an API key**
   - Anthropic: <https://console.anthropic.com/settings/keys> (key starts with `sk-ant-`)
   - or Google Gemini: <https://aistudio.google.com/apikey> (key starts with `AIza`)

2. **Enter it in Raycast**
   Raycast → Settings → Extensions → Text AI → set `Provider`, `API Key`, `Model`.
   Raycast stores the key in the macOS Keychain. It is never written to this repo.

3. **Anthropic only: `Workspace ID`, if your key needs it**
   Anthropic has three key types. A *workspace key* and a *single-workspace* personal key
   resolve on their own, so leave `Workspace ID` empty. A **multi-workspace** personal or
   service account key is bound to your identity rather than to a workspace, and every
   request must name the workspace it acts in, otherwise the API returns:

   > HTTP 400: anthropic-workspace-id is required when authenticating with an
   > identity-linked API key

   Two ways out, either is fine:
   - Set `Workspace ID` to the `wrkspc_...` value from
     <https://platform.claude.com/settings/workspaces>, or
   - Create a key scoped to a single workspace instead, and leave the field empty.

   See [Workspaces → API keys and resource scoping](https://platform.claude.com/docs/en/manage-claude/workspaces#api-keys-and-resource-scoping).

4. **Assign hotkeys**
   Same screen, set a shortcut per command. Suggested: `⌥T` translate, `⌥P` polish.

5. **Accessibility permission**
   Reading the selection needs it. System Settings → Privacy & Security → Accessibility → Raycast.

## Model choice

Default is `claude-haiku-4-5-20251001`: cheap and fast. The system prompt pins Taiwanese
technical vocabulary (磁碟 not 磁盤, 快取 not 緩存, …) because without it small models drift
into mainland terms. Verified against a real sentence before shipping.

Do not assume Sonnet 5 is the safe upgrade. In ad-hoc testing on this exact prompt,
Haiku held the translation direction on every trial while Sonnet sometimes returned the
English unchanged. That test ran through the `claude` CLI rather than the direct API this
extension uses, so treat it as a caution, not a measurement: if you switch models, re-run
your own sample first. Any model is a preference change, no code change needed.

Rough cost at ~20 invocations/day (~200 in / 150 out each): single-digit USD per year,
against USD 96/year for Raycast Pro.

## Rebuilding after a code change

`@raycast/api` 2.x requires Node >= 22.22.2. The nvm default here is 20.20.2, so use the
Homebrew Node explicitly:

```sh
cd path/to/raycast-text-ai
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm run dev     # imports into Raycast, watches for changes; Ctrl-C when done
```

The extension stays installed at `~/.config/raycast/extensions/text-ai` after the watcher
stops. `npm run build` alone compiles to `dist/` but does not import into Raycast.
