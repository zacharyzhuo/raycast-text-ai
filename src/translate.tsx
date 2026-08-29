import { ConversationView } from "./ConversationView";
import { TRANSLATE_PROMPT } from "./prompts";

export default function Command() {
  return <ConversationView systemPrompt={TRANSLATE_PROMPT} navigationTitle="Translate Selection" />;
}
