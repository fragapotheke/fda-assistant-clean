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
          // 🧵 Thread erstellen
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
          if (!threadId) throw new Error("Thread konnte nicht erstellt werden");

          // 📨 Nachricht senden
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

          // ▶️ Run starten
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
          if (!runId) throw new Error("Run konnte nicht gestartet werden");

          // ⏳ Auf Completion warten (max. 10s)
          let completed = false;
          let attempts = 0;
          let result;

          while (!completed && attempts < 10) {
            await new Promise((r) => setTimeout(r, 1000));
            const checkRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
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
            throw new Error("Antwortzeit überschritten");
          }

          // 📩 Nachricht auslesen
          const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });
          const messagesData = await messagesRes.json();
          const lastMessage = messagesData.data?.find(
            (msg: any) => msg.role === "assistant"
          );

          let aiMessage = lastMessage?.content?.[0]?.text?.value || "";

          // 📉 Antwortqualität bewerten
          const isWeak =
            aiMessage.length < 150 ||
            aiMessage.toLowerCase().includes("keine informationen") ||
            aiMessage.toLowerCase().includes("offizielle website") ||
            aiMessage.toLowerCase().includes("leider konnte ich");

          if (isWeak) {
            const searchResults = await searchGoogle(message);
            if (searchResults.length > 0) {
              const context = searchResults.slice(0, 3).join("\n\n");

              // ➕ Kontext aus Websuche hinzufügen
              await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({
                  role: "user",
                  content: `Hier sind einige Web-Ergebnisse:\n\n${context}\n\nBitte beantworte die Frage erneut auf Basis dieser Informationen.`,
                }),
              });

              const rerunRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
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

              const rerunData = await rerunRes.json();
              const rerunId = rerunData?.id;

              // ⏳ Erneut auf Antwort warten
              let rerunCompleted = false;
              let rerunAttempts = 0;

              while (!rerunCompleted && rerunAttempts < 10) {
                await new Promise((r) => setTimeout(r, 1000));
                const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${rerunId}`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });
                const statusData = await statusRes.json();
                if (statusData.status === "completed") {
                  rerunCompleted = true;
                }
                rerunAttempts++;
              }

              const updatedMessages = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              });
              const updatedData = await updatedMessages.json();
              const finalMessage = updatedData.data?.find(
                (msg: any) => msg.role === "assistant"
              );

              aiMessage = finalMessage?.content?.[0]?.text?.value || aiMessage;
            }
          }

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
          console.error("❗ Fehler im Assistant-Flow:", error);
          set({
            chats: [
              ...get().chats,
              {
                message: {
                  data: {
                    content:
                      "❗ Die Antwort konnte nicht geladen werden. Bitte versuche es erneut.",
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;