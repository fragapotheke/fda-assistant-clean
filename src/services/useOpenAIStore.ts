import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";
import { searchGoogle } from "@/services/googleSearch";

const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY!;
const assistantId = process.env.NEXT_PUBLIC_ASSISTANT_ID!;

export type Chats = Chat[];
export type ChatType = "ai" | "human";

export interface Chat {
  message: Message;
}

export interface Message {
  data: MessageData;
  type: ChatType;
}

export interface MessageData {
  type: ChatType;
  content: string;
  example?: boolean;
  is_chunk?: boolean;
  additional_kwargs?: AdditionalKwargs;
}

export interface AdditionalKwargs {}

const useOpenAIStore = create(
  combine(
    {
      chats: [] as Chats,
      typing: false,
      message: "",
    },
    (set, get) => ({
      getMessage: async (widget: IDetailsWidget) => {
        const userInput = get().message;
        if (!userInput || !assistantId) return;

        // Menschliche Nachricht anzeigen
        set((prev) => ({
          typing: true,
          chats: [
            ...prev.chats,
            {
              message: {
                data: {
                  content: userInput,
                  is_chunk: false,
                  type: "human",
                },
                type: "human",
              },
            },
          ],
          message: "",
        }));

        const askAssistant = async (content: string) => {
          const threadRes = await fetch("https://api.openai.com/v1/threads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });

          const { id: threadId } = await threadRes.json();

          await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({
              role: "user",
              content,
            }),
          });

          const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({ assistant_id: assistantId }),
          });

          const { id: runId } = await runRes.json();

          let completed = false;
          let attempts = 0;
          while (!completed && attempts < 10) {
            await new Promise((r) => setTimeout(r, 1000));
            const check = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });
            const data = await check.json();
            if (data.status === "completed") {
              completed = true;
              break;
            }
            attempts++;
          }

          const msgRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });

          const msgData = await msgRes.json();
          const lastMessage = msgData.data?.find((msg: any) => msg.role === "assistant");
          return lastMessage?.content?.[0]?.text?.value?.trim() || "";
        };

        try {
          let aiResponse = await askAssistant(userInput);
          const aiResponseLower = aiResponse.toLowerCase();

          const isWeak =
            !aiResponse ||
            aiResponse.length < 60 ||
            aiResponseLower.includes("keine information") ||
            aiResponseLower.includes("besuche die offizielle") ||
            aiResponseLower.includes("ich konnte leider");

          if (isWeak) {
            console.log("🧠 Unzureichende Antwort – starte Websuche");
            const webResults = await searchGoogle(userInput);
            console.log("🌐 Google-Ergebnisse:", webResults);

            if (webResults.length > 0) {
              const googleContext = `Hier sind Web-Ergebnisse zu meiner Frage:\n\n${webResults.join("\n\n")}\n\nBitte fasse die Informationen strukturiert zusammen.`;
              aiResponse = await askAssistant(`${userInput}\n\n${googleContext}`);
            } else {
              aiResponse = "❗ Es konnten keine passenden Web-Ergebnisse gefunden werden.";
            }
          }

          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(aiResponse),
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
        } catch (error) {
          console.error("❗ Fehler im Assistant-Flow:", error);
          set({ typing: false });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;