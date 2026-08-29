import { ConversationView } from "./ConversationView";
import { POLISH_PROMPT } from "./prompts";

export default function Command() {
  return <ConversationView systemPrompt={POLISH_PROMPT} navigationTitle="Polish English Selection" />;
}
