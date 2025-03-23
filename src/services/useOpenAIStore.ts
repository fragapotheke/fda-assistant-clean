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
        const userMessage = get().message;
        if (!userMessage || !assistantId) return;

        set((prev) => ({
          typing: true,
          chats: [
            ...prev.chats,
            {
              message: {
                data: {
                  content: userMessage,
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
          // ⏱ Timer starten
          const startTime = Date.now();

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

          // 💬 User-Nachricht hinzufügen
          await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
            body: JSON.stringify({
              role: "user",
              content: userMessage,
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

          // ⏳ Warten auf Completion (max. 10 Sek.)
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

          const responseTime = (Date.now() - startTime) / 1000;
          const lower = aiMessage.toLowerCase();
          const isWeak =
            aiMessage.length < 80 ||
            lower.includes("keine informationen") ||
            lower.includes("leider konnte ich") ||
            lower.includes("ich bin mir nicht sicher") ||
            lower.includes("besuche die offizielle seite") ||
            lower.includes("ich empfehle dir") ||
            responseTime > 9;

          // 🌐 Google-Suche bei schwacher Antwort
          if (isWeak) {
            console.log("🔍 Assistant-Antwort zu schwach → Starte Google-Suche...");
            const webResults = await searchGoogle(userMessage);
            if (webResults.length > 0) {
              // Neue Run mit Web-Snippets starten
              const formattedContext = webResults.join("\n\n");

              const followUpRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({
                  role: "user",
                  content: `Nutze die folgenden Informationen aus einer Websuche als Kontext:\n\n${formattedContext}\n\nFrage: ${userMessage}`,
                }),
              });

              const newRunRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
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

              const newRunData = await newRunRes.json();
              const newRunId = newRunData?.id;
              if (newRunId) {
                // Wieder auf Antwort warten
                let followUpCompleted = false;
                let followUpAttempts = 0;
                while (!followUpCompleted && followUpAttempts < 10) {
                  await new Promise((r) => setTimeout(r, 1000));
                  const check = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${newRunId}`, {
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                      "OpenAI-Beta": "assistants=v2",
                    },
                  });
                  const status = await check.json();
                  if (status.status === "completed") {
                    followUpCompleted = true;
                  }
                  followUpAttempts++;
                }

                const newMessages = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                });
                const newData = await newMessages.json();
                const newReply = newData.data?.find(
                  (msg: any) => msg.role === "assistant"
                );
                aiMessage = newReply?.content?.[0]?.text?.value || aiMessage;
              }
            } else {
              aiMessage += "\n\n❗ Auch in der Websuche konnten keine verlässlichen Informationen gefunden werden.";
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
        } catch (err) {
          console.error("❗ Fehler im Flow:", err);
          set({ typing: false });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;