# Install guide, written for an AI agent

**Audience:** you are an AI coding agent with shell access on the Mac where this
extension should be installed. The human next to you is the end user. Follow this
document top to bottom. Every command is meant to be run as-is.

**Outcome:** two Raycast commands, `Translate Selection` and `Polish English Selection`,
bound to hotkeys, working on the user's selected text.

---

## 0. Secrets: read this before anything else

This extension needs an Anthropic API key. The user was given one privately.

- **Never** write the key into a file, a shell command, an environment variable, a
  commit, or your own chat output.
- The key goes into Raycast's preferences UI, which stores it in the macOS Keychain.
  **The human types it there themselves.** You do not need to see it and must not ask
  for it to be pasted to you.
- If you ever see the key in your context, do not echo it back and do not persist it.

---

## 1. Check preconditions

```sh
sw_vers                      # macOS
ls -d /Applications/Raycast.app 2>/dev/null && echo "Raycast: installed"
node -v 2>/dev/null || echo "node: not installed"
git --version
```

Requirements:

| Thing | Requirement | If missing |
|---|---|---|
| macOS | any recent version | stop, this is macOS only |
| Raycast | installed and signed in | user installs from <https://raycast.com>. The **free** tier is enough; Pro is not needed |
| Node | **>= 22.22.2** | see step 2 |
| git | any | `xcode-select --install` |

Node 22.22.2 is a hard floor: `@raycast/api` v2 declares it in `engines`, and the
Raycast runtime itself ships Node 22.22.2. An older Node will fail the build.

---

## 2. Get a new enough Node

Check what is already available before installing anything:

```sh
for p in /opt/homebrew/opt/node/bin/node /usr/local/opt/node/bin/node "$(command -v node)"; do
  [ -x "$p" ] && echo "$p -> $($p --version)"
done
ls ~/.nvm/versions/node 2>/dev/null
```

Pick any binary reporting **v22.22.2 or newer** and use it for the build by putting its
directory first on `PATH`. Do **not** change the user's default Node; scope it to this
work only.

If nothing qualifies, install one:

```sh
# Homebrew present
brew install node

# otherwise, nvm
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install 24 && nvm use 24
```

Then set, for every later step in this document:

```sh
export PATH="/opt/homebrew/opt/node/bin:$PATH"   # adjust to the binary you chose
node -v                                          # must print >= v22.22.2
```

---

## 3. Clone

```sh
mkdir -p ~/Developer
git clone https://github.com/zacharyzhuo/raycast-text-ai.git ~/Developer/raycast-text-ai
cd ~/Developer/raycast-text-ai
```

The repo is public, so no GitHub authentication is needed. Keep the clone in place after
installing; future updates are `git pull` plus a rebuild.

---

## 4. Install dependencies and import into Raycast

```sh
cd ~/Developer/raycast-text-ai
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm install --no-audit --no-fund
```

Raycast must be **running** for the next step. Then:

```sh
npm run dev
```

`npm run dev` runs `ray develop`, which builds the extension **and hands it to the running
Raycast app**. Wait until it prints `built extension successfully`, give it a few more
seconds, then stop it with Ctrl-C (or `pkill -f "ray develop"`).

> **Trap:** `npm run build` alone only writes to `dist/` and does **not** install anything
> into Raycast. `npm run dev` is the step that installs. This is the single most common
> way to think you are done when nothing was installed.

The extension **stays installed** after the watcher stops. It does not need to keep running.

---

## 5. Verify the install landed

```sh
ls ~/.config/raycast/extensions/text-ai
node -e 'const p=require(process.env.HOME+"/.config/raycast/extensions/text-ai/package.json");
console.log("commands:", p.commands.map(c=>c.name+":"+c.mode).join(", "));
console.log("prefs:", p.preferences.map(x=>x.name).join(", "));'
```

Expected:

```
assets  package.json  polish.js  polish.js.map  translate.js  translate.js.map
commands: translate:view, polish:view
prefs: provider, apiKey, workspaceId, model
```

Local extensions live under `~/.config/raycast/extensions/<name>` (by name), alongside
store extensions which use UUID directory names.

> **Trap:** do not try to verify by opening
> `raycast://extensions/zacharyzhuo/text-ai/translate`. Deep links do not resolve for
> unpublished local extensions, and a failure there means nothing.

---

## 6. Hand off to the human: preferences

Tell the user to do this themselves. You cannot and should not do it for them.

1. Open Raycast → **Settings** (`Cmd+,`) → **Extensions** → find **Text AI**
2. Fill in:

| Field | Value |
|---|---|
| **Provider** | `Anthropic` |
| **API Key** | the key they received privately (starts with `sk-ant-`) |
| **Workspace ID** | leave **empty** for now, see troubleshooting below |
| **Model** | leave as `claude-haiku-4-5-20251001` |

Raycast writes the key to the macOS Keychain. It never touches the repo.

---

## 7. Accessibility permission

Reading the selected text requires it:

**System Settings → Privacy & Security → Accessibility → enable Raycast.**

Without this the commands report "Could not read the selection".

---

## 8. Hotkeys

Same Raycast settings screen, one shortcut per command. Suggested, adjust to taste:

| Command | Suggested hotkey |
|---|---|
| Translate Selection | `Option+T` |
| Polish English Selection | `Option+P` |

---

## 9. End-to-end test

Ask the user to:

1. Select this sentence anywhere (a note, a browser text box, a chat window):
   `The deploy is blocked until the review lands.`
2. Press the Translate hotkey.
3. A Raycast window should open, show a brief loading state, then list two rows:
   the original and the Traditional Chinese translation. Highlight a row to read it
   in full on the right.
4. Press **Enter** to paste the translation over the selection.

Then test a follow-up: run it again, and this time type `更口語一點` in the search bar
and press **Enter**. A third row should appear with a revised version. Highlight it and
press **Cmd+Enter** to paste that one instead.

Key bindings inside the window:

| Search bar | Enter | Cmd+Enter | Cmd+Shift+C |
|---|---|---|---|
| empty | paste the highlighted row | paste | copy |
| contains a question | send the follow-up | paste the highlighted row | copy |

If all of that works, you are done.

---

## Troubleshooting

### `Anthropic HTTP 400: ... anthropic-workspace-id is required when authenticating with an identity-linked API key`

The key is a multi-workspace personal or service account key, which is not bound to one
workspace, so each request has to name the workspace it acts in.

Ask the user to get the `wrkspc_...` value from whoever gave them the key, or from
<https://platform.claude.com/settings/workspaces>, and put it in the **Workspace ID**
preference. See
[Workspaces → API keys and resource scoping](https://platform.claude.com/docs/en/manage-claude/workspaces#api-keys-and-resource-scoping).

### `Anthropic HTTP 400: Your credit balance is too low`

The Anthropic API is prepaid and billed separately from any Claude subscription. Whoever
owns the key needs to add credits at <https://platform.claude.com/settings/billing>.
Nothing to fix on this machine.

### `Anthropic HTTP 401` / `invalid x-api-key`

The key was mistyped or truncated. Have the user re-paste it into the preference field.

### The window opens but sits on "Working…" forever

Should not happen on current `main`; it was a bug fixed in this repo. If it reappears:

```sh
cd ~/Developer/raycast-text-ai
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm run dev          # leave this running
# have the user trigger the command, then in another shell:
cat ~/.config/raycast/extensions/text-ai/dev.log
```

`dev.log` collects the extension's `console.log` output while `ray develop` is running,
formatted as `["Debug","..."]` lines. It is the only usable debugging channel here.

### "Nothing selected"

The user ran the command without selecting text first, or the frontmost app does not
expose its selection over the Accessibility API. Try in a plain text field.

### Build fails with `EBADENGINE` or a TypeScript/esbuild error

Node is too old. Go back to step 2 and confirm `node -v` prints >= v22.22.2 **in the same
shell** where you run `npm`.

---

## Updating later

```sh
cd ~/Developer/raycast-text-ai
git pull
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm install --no-audit --no-fund
npm run dev     # re-imports into Raycast; Ctrl-C once it says built successfully
```

Preferences, including the API key, survive updates.

## Uninstalling

Remove it from Raycast → Settings → Extensions, or:

```sh
rm -rf ~/.config/raycast/extensions/text-ai ~/Developer/raycast-text-ai
```

The API key stays in the Keychain until removed via Raycast's settings.
