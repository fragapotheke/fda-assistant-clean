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
        const message = get().message;
        if (!message || !assistantId) return;

        set((prev) => ({
          typing: true,
          chats: [
            ...prev.chats,
            {
              message: {
                data: {
                  content: message,
                  is_chunk: false,
                  type: "human",
                },
                type: "human",
              },
            },
          ],
          message: "",
        }));

        try {
          // 🔁 1. Thread erstellen
          const threadRes = await fetch("https://api.openai.com/v1/threads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });
          const threadData = await threadRes.json();
          const threadId = threadData?.id;
          if (!threadId) return;

          // ➕ 2. Nachricht hinzufügen
          await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({
              role: "user",
              content: message,
            }),
          });

          // ▶️ 3. Assistant-Run starten
          const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({
              assistant_id: assistantId,
            }),
          });

          const runData = await runRes.json();
          const runId = runData?.id;
          if (!runId) return;

          // ⏳ 4. Auf Abschluss warten (max. 10s)
          let completed = false;
          let attempts = 0;

          while (!completed && attempts < 10) {
            await new Promise((r) => setTimeout(r, 1000));
            const checkRes = await fetch(
              `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              }
            );
            const checkData = await checkRes.json();
            if (checkData.status === "completed") {
              completed = true;
              break;
            }
            attempts++;
          }

          if (!completed) return;

          // 📩 5. Antwort abrufen
          const messagesRes = await fetch(
            `https://api.openai.com/v1/threads/${threadId}/messages`,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            }
          );
          const messagesData = await messagesRes.json();
          const lastMessage = messagesData.data?.find(
            (msg: any) => msg.role === "assistant"
          );
          let aiMessage = lastMessage?.content?.[0]?.text?.value || "";

          // 📉 6. Qualität prüfen → Websuche starten, falls nötig
          const shouldFallbackToGoogle = !aiMessage ||
            aiMessage.length < 60 ||
            aiMessage.toLowerCase().includes("keine information") ||
            aiMessage.toLowerCase().includes("offizielle webseite") ||
            aiMessage.toLowerCase().includes("leider konnte ich");

          if (shouldFallbackToGoogle) {
            console.log("🌍 Assistant-Antwort zu vage → Starte Google-Suche…");
            const webResults = await searchGoogle(message);

            if (webResults.length > 0) {
              aiMessage = webResults.join("\n\n");
            } else {
              aiMessage = "❗ Keine passenden Informationen in der Websuche gefunden.";
            }
          }

          // ✅ 7. Antwort anzeigen
          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(aiMessage),
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
          console.error("❗ Fehler im Assistant/Websuche Flow:", error);
          set({ typing: false });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;