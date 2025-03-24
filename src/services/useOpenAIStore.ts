// src/services/useOpenAIStore.ts

import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";
import { searchGoogleJSON } from "@/services/googleSearch";

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

          const [googleResults, threadData] = await Promise.all([
            searchGoogleJSON(message),
            fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            }).then((res) => res.json()),
          ]);

          const threadId = threadData?.id;
          if (!threadId) throw new Error("Assistant-Thread konnte nicht erstellt werden.");

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
            body: JSON.stringify({
              assistant_id: assistantId,
            }),
          });

          const runData = await runRes.json();
          const runId = runData?.id;
          if (!runId) throw new Error("Assistant-Run konnte nicht gestartet werden.");

          let completed = false;
          let attempts = 0;

          while (!completed && attempts < 15) {
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
            }
            attempts++;
          }

          if (!completed) throw new Error("Run wurde nicht rechtzeitig abgeschlossen");

          const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });

          const messagesData = await messagesRes.json();
          const lastMessage = messagesData.data?.find((msg: any) => msg.role === "assistant");

          let assistantAnswer = lastMessage?.content?.[0]?.text?.value || "";

          console.log("🤖 Assistant-Antwort:", assistantAnswer);
          console.log("📎 Google-Ergebnisse als JSON:", googleResults);

          const isWeak =
            !assistantAnswer ||
            assistantAnswer.length < 100 ||
            assistantAnswer.toLowerCase().includes("keine informationen") ||
            assistantAnswer.toLowerCase().includes("offizielle website") ||
            assistantAnswer.toLowerCase().includes("nicht gefunden") ||
            assistantAnswer.toLowerCase().includes("ich bin mir nicht sicher");

          if (isWeak && googleResults.length > 0) {
            console.log("↩️ Assistant-Antwort zu schwach – starte neuen Assistant-Run mit JSON-Kontext...");

            const newThreadRes = await fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });

            const newThreadData = await newThreadRes.json();
            const newThreadId = newThreadData?.id;

            const searchJSON = googleResults.slice(0, 3).join("\n\n");

            const customPrompt = `
Die folgenden JSON-ähnlich formatierten Ergebnisse stammen aus einer Google-Websuche.

Wenn nach "Zusammensetzung", "Inhaltsstoffen" oder ähnlichen Begriffen gefragt ist:
- Extrahiere die Inhaltsstoffe und gib sie als **strukturierte Liste** aus.

Wenn es um medizinische Informationen geht:
- Fasse diese laienverständlich zusammen.

WICHTIG:
- Antworte nur, wenn sich **belastbare Informationen direkt aus den Suchergebnissen** ableiten lassen.
- Wenn unklar, schreibe: "Die Websuche lieferte keine belastbaren Informationen."

Frage: ${message}

Google-Ergebnisse:
${searchJSON}
`;

            await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                role: "user",
                content: customPrompt,
              }),
            });

            const secondRun = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs`, {
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

            const secondRunData = await secondRun.json();
            const secondRunId = secondRunData?.id;

            let secondCompleted = false;
            let secondAttempts = 0;
            while (!secondCompleted && secondAttempts < 10) {
              await new Promise((r) => setTimeout(r, 1000));
              const check = await fetch(
                `https://api.openai.com/v1/threads/${newThreadId}/runs/${secondRunId}`,
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                }
              );
              const checkData = await check.json();
              if (checkData.status === "completed") {
                secondCompleted = true;
              }
              secondAttempts++;
            }

            const finalMessages = await fetch(
              `https://api.openai.com/v1/threads/${newThreadId}/messages`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              }
            );

            const finalMessagesData = await finalMessages.json();
            const finalMsg = finalMessagesData.data?.find((msg: any) => msg.role === "assistant");
            assistantAnswer = finalMsg?.content?.[0]?.text?.value || assistantAnswer;
          }

          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(assistantAnswer),
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
            typing: false,
            chats: [
              ...get().chats,
              {
                message: {
                  data: {
                    content: "❗ Die Antwort konnte nicht geladen werden. Bitte versuche es erneut.",
                    type: "ai",
                    is_chunk: false,
                  },
                  type: "ai",
                },
              },
            ],
          });
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;