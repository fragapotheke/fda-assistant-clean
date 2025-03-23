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
          console.log("🧵 Starte neuen Assistant-Thread...");
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
          if (!threadId) throw new Error("❌ Kein Thread erstellt");

          console.log("📨 Sende Nutzernachricht an Assistant...");
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

          console.log("▶️ Starte Assistant-Run...");
          const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({ assistant_id: assistantId }),
          });

          const runData = await runRes.json();
          const runId = runData?.id;
          if (!runId) throw new Error("❌ Kein Run gestartet");

          console.log("⏳ Warte auf Assistant-Antwort...");
          let completed = false;
          let attempts = 0;

          while (!completed && attempts < 12) {
            await new Promise((r) => setTimeout(r, 1000));
            const statusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });

            const statusData = await statusRes.json();
            if (statusData.status === "completed") {
              completed = true;
              break;
            }

            attempts++;
          }

          let aiMessage = "";

          if (completed) {
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

            aiMessage = lastMessage?.content?.[0]?.text?.value?.trim() || "";
          } else {
            console.warn("⚠️ Timeout bei Assistant-Antwort");
            aiMessage = "";
          }

          const shouldUseWebSearch =
            !aiMessage ||
            aiMessage.length < 50 ||
            aiMessage.toLowerCase().includes("keine information") ||
            aiMessage.toLowerCase().includes("leider konnte ich") ||
            aiMessage.toLowerCase().includes("ich empfehle");

          if (shouldUseWebSearch) {
            console.log("🔍 Assistant-Antwort war unzureichend → starte Google-Suche...");
            const webResults = await searchGoogle(message);

            if (webResults.length > 0) {
              const webContext = webResults.join("\n\n");

              console.log("▶️ Starte zweiten Assistant-Run mit Webkontext...");
              await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({
                  role: "user",
                  content: `Nutze folgende Websuche als Kontext:\n\n${webContext}`,
                }),
              });

              const runRes2 = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({ assistant_id: assistantId }),
              });

              const runData2 = await runRes2.json();
              const runId2 = runData2?.id;
              if (!runId2) throw new Error("❌ Zweiter Run konnte nicht gestartet werden");

              // Wieder auf Antwort warten
              completed = false;
              attempts = 0;

              while (!completed && attempts < 12) {
                await new Promise((r) => setTimeout(r, 1000));
                const checkRes2 = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId2}`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });

                const checkData2 = await checkRes2.json();
                if (checkData2.status === "completed") {
                  completed = true;
                  break;
                }

                attempts++;
              }

              if (completed) {
                const messagesRes2 = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });

                const messagesData2 = await messagesRes2.json();
                const lastMessage2 = messagesData2.data?.find(
                  (msg: any) => msg.role === "assistant"
                );

                aiMessage = lastMessage2?.content?.[0]?.text?.value?.trim() || "";
              } else {
                aiMessage = "❗ Die Antwort konnte nicht vollständig generiert werden.";
              }
            } else {
              aiMessage = "❗ Keine verwertbaren Web-Ergebnisse gefunden.";
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
          set({ typing: false });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;