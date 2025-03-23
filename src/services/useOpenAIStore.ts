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

        // Nutzeranfrage abspeichern
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
          if (!threadId) return;

          console.log("📨 Sende Nutzernachricht an Assistant...");

          // 💬 Nachricht hinzufügen
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
          if (!runId) return;

          // ⏳ Auf Antwort warten
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

          if (!completed) return;

          // 📩 Antwort extrahieren
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

          let aiMessage =
            lastMessage?.content?.[0]?.text?.value || "";

          console.log("📥 Erste Assistant-Antwort:", aiMessage);

          // Schwache Antwort erkennen
          const lower = aiMessage.toLowerCase();
          const triggersWebSearch =
            !aiMessage ||
            aiMessage.length < 100 ||
            lower.includes("keine informationen") ||
            lower.includes("besuche die offizielle") ||
            lower.includes("leider konnte ich");

          if (triggersWebSearch) {
            console.log("🔍 Starte Websuche wegen unzureichender Antwort...");
            const webResults = await searchGoogle(message);
            console.log("🌐 Ergebnisse aus Websuche:", webResults);

            if (webResults.length > 0) {
              // Neue Assistant-Runde mit Web-Daten starten
              console.log("📨 Sende Web-Ergebnisse als Kontext an Assistant...");

              await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({
                  role: "user",
                  content: `Hier sind Informationen aus einer Websuche:\n\n${webResults.join("\n\n")}\n\nBitte beantworte die ursprüngliche Frage mit diesen Informationen so klar und strukturiert wie möglich.`,
                }),
              });

              // ⏯️ Neuer Run
              const runRes2 = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
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

              const runData2 = await runRes2.json();
              const runId2 = runData2?.id;
              if (!runId2) return;

              // ⏳ Warten auf zweite Antwort
              let completed2 = false;
              let attempts2 = 0;
              let result2;

              while (!completed2 && attempts2 < 10) {
                await new Promise((r) => setTimeout(r, 1000));
                const checkRes2 = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId2}`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });

                const checkData2 = await checkRes2.json();
                if (checkData2.status === "completed") {
                  completed2 = true;
                  result2 = checkData2;
                  break;
                }

                attempts2++;
              }

              if (completed2) {
                const finalMessagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });

                const finalMessagesData = await finalMessagesRes.json();
                const finalMessage = finalMessagesData.data?.find(
                  (msg: any) => msg.role === "assistant"
                );

                aiMessage = finalMessage?.content?.[0]?.text?.value || aiMessage;
              }
            }
          }

          // 🧠 Antwort anzeigen
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