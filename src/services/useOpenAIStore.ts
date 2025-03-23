import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";

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
          // 🧵 Thread erstellen
          const threadRes = await fetch("https://api.openai.com/v1/threads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2", // ✅ NEU
            },
          });

          const threadData = await threadRes.json();
          console.log("🧵 Thread erstellen – Antwort:", threadData);

          const threadId = threadData?.id;
          if (!threadId) {
            console.error("❗ Fehler in OpenAI Assistant Flow: Thread konnte nicht erstellt werden");
            return;
          }

          // 💬 Nachricht hinzufügen
          const messageRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2", // ✅ NEU
            },
            body: JSON.stringify({
              role: "user",
              content: message,
            }),
          });

          const messageData = await messageRes.json();

          // ▶️ Run starten
          const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2", // ✅ NEU
            },
            body: JSON.stringify({
              assistant_id: assistantId,
            }),
          });

          const runData = await runRes.json();
          const runId = runData?.id;

          if (!runId) {
            console.error("❗ Fehler beim Starten des Assistant-Runs:", runData);
            return;
          }

          // ⏳ Auf Completion warten
          let completed = false;
          let attempts = 0;
          let result;

          while (!completed && attempts < 10) {
            await new Promise((r) => setTimeout(r, 1000));
            const checkRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2", // ✅ NEU
              },
            });

            const checkData = await checkRes.json();
            if (checkData.status === "completed") {
              completed = true;
              result = checkData;
              break;
            }

            attempts++;
          }

          if (!completed) {
            console.error("❗ Run nicht abgeschlossen oder Timeout erreicht");
            return;
          }

          // 📩 Nachrichten abrufen
          const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2", // ✅ NEU
            },
          });

          const messagesData = await messagesRes.json();
          const lastMessage = messagesData.data?.find(
            (msg: any) => msg.role === "assistant"
          );

          const aiMessage =
            lastMessage?.content?.[0]?.text?.value ||
            "❗ Es gab ein Problem bei der Antwort von OpenAI.";

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
          console.error("❗ Unerwarteter Fehler im Assistant-Flow:", error);
          set({ typing: false });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;