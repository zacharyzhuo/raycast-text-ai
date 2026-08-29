import { useEffect, useRef, useState } from "react";
import { Action, ActionPanel, Icon, List, getSelectedText, showToast, Toast } from "@raycast/api";
import { complete, LLMError, Message } from "./llm";
import { FOLLOWUP_PROMPT } from "./prompts";

const TITLE_MAX = 60;
const SELECTION_TIMEOUT_MS = 5_000;

interface Props {
  /** Strict, single-purpose prompt used for the first turn only. */
  systemPrompt: string;
  navigationTitle: string;
}

/**
 * Shows the transformed selection, then lets the user keep asking about it.
 *
 * Turn 1 runs under the strict prompt so its output stays paste-ready. Every later turn
 * runs under FOLLOWUP_PROMPT over the same history, which is what allows explanations
 * and revisions without loosening the contract the first result depends on.
 */
export function ConversationView({ systemPrompt, navigationTitle }: Props) {
  const [turns, setTurns] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    // Pinned to first mount: every keystroke re-renders this component, and re-reading
    // the selection then would come back empty because Raycast now holds focus.
    //
    // Deliberately no cleanup that suppresses state updates. React mounts a component
    // twice in development (mount, unmount, mount). Pairing this ref guard with a
    // "cancelled" flag meant the first mount did the work but had every setState
    // discarded, while the second mount skipped seeding entirely, leaving the view
    // stuck on "Working..." forever. The ref guard alone already ensures one run.
    if (seeded.current) return;
    seeded.current = true;

    async function seed() {
      let selected: string;
      try {
        selected = await withTimeout(getSelectedText(), SELECTION_TIMEOUT_MS, "reading the selection");
      } catch {
        setFailure(
          "Could not read the selection. Grant Raycast Accessibility access in System Settings > Privacy & Security > Accessibility, then select text and try again.",
        );
        setBusy(false);
        return;
      }

      if (!selected.trim()) {
        setFailure("Nothing selected. Select some text first, then run this command.");
        setBusy(false);
        return;
      }

      const opening: Message = { role: "user", content: selected };
      setTurns([opening]);

      try {
        const answer = await complete(systemPrompt, [opening]);
        setTurns([opening, { role: "assistant", content: answer }]);
      } catch (error) {
        setFailure(error instanceof LLMError ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }

    seed();
  }, []);

  async function send() {
    const question = draft.trim();
    if (!question || busy) return;

    const history: Message[] = [...turns, { role: "user", content: question }];
    setTurns(history);
    setDraft("");
    setBusy(true);

    try {
      const answer = await complete(FOLLOWUP_PROMPT, history);
      setTurns([...history, { role: "assistant", content: answer }]);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Follow-up failed",
        message: error instanceof LLMError ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <List
      isLoading={busy}
      isShowingDetail={turns.length > 0}
      filtering={false}
      searchText={draft}
      onSearchTextChange={setDraft}
      searchBarPlaceholder={busy ? "Working…" : "Ask a follow-up, then press Enter"}
      navigationTitle={navigationTitle}
    >
      {failure ? (
        <List.EmptyView icon={Icon.ExclamationMark} title="Failed" description={failure} />
      ) : (
        turns.map((turn, index) => (
          <List.Item
            key={index}
            id={String(index)}
            icon={turn.role === "assistant" ? Icon.Stars : Icon.Person}
            title={firstLine(turn.content)}
            subtitle={turn.role === "assistant" ? "Result" : index === 0 ? "Original" : "You"}
            detail={<List.Item.Detail markdown={turn.content} />}
            actions={actionsFor(turn.content, draft.trim().length > 0, send)}
          />
        ))
      )}
    </List>
  );
}

/**
 * Enter does the obvious thing for whatever the user is doing: pasting when the search
 * bar is empty, sending when they have typed a question. Paste keeps Cmd+Enter either way.
 */
function actionsFor(content: string, hasDraft: boolean, send: () => void) {
  if (hasDraft) {
    return (
      <ActionPanel>
        <Action title="Send Follow-Up" icon={Icon.Message} onAction={send} />
        <Action.Paste
          title="Paste This Turn"
          content={content}
          icon={Icon.Text}
          shortcut={{ modifiers: ["cmd"], key: "return" }}
        />
        <Action.CopyToClipboard title="Copy This Turn" content={content} />
      </ActionPanel>
    );
  }

  return (
    <ActionPanel>
      <Action.Paste title="Paste This Turn" content={content} icon={Icon.Text} />
      <Action.CopyToClipboard title="Copy This Turn" content={content} />
      <Action title="Send Follow-Up" icon={Icon.Message} onAction={send} />
    </ActionPanel>
  );
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0];
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

/** Keeps a hung call from leaving the view spinning with no explanation. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out ${what} after ${ms / 1000}s.`)), ms)),
  ]);
}
