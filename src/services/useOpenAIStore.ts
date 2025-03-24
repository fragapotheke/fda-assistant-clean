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

          // Thread erstellen
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
          if (!threadId) throw new Error("Assistant-Thread konnte nicht erstellt werden.");

          // Nachricht hinzufügen
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

          console.log("🌐 Starte Google-Suche...");
          const googlePromise = searchGoogleJSON(message);

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

          // ⏳ Warte auf Run
          let completed = false;
          let attempts = 0;
          while (!completed && attempts < 20) {
            console.log(`⏳ Assistant-Run: Versuch ${attempts + 1}/20`);
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
              break;
            }
            attempts++;
          }

          if (!completed) throw new Error("Run wurde nicht rechtzeitig abgeschlossen");

          // 📩 Assistant-Antwort abrufen
          const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });

          const messagesData = await messagesRes.json();
          const lastMessage = messagesData.data?.find((msg: any) => msg.role === "assistant");
          let assistantMessage = lastMessage?.content?.[0]?.text?.value || "";
          console.log("🤖 Assistant-Antwort:", assistantMessage);

          // 📎 Google-Ergebnisse (parallel geladen)
          const googleResults = await googlePromise;
          console.log("📎 Google-Ergebnisse als JSON:", googleResults);

          // Bewertung der Assistant-Antwort
          const isWeak =
            !assistantMessage ||
            assistantMessage.length < 100 ||
            assistantMessage.toLowerCase().includes("keine informationen") ||
            assistantMessage.toLowerCase().includes("offizielle website") ||
            assistantMessage.toLowerCase().includes("nicht gefunden") ||
            assistantMessage.toLowerCase().includes("ich bin mir nicht sicher");

          let finalAnswer = assistantMessage;

          if (isWeak && googleResults.length > 0) {
            console.log("↩️ Assistant-Antwort zu schwach – starte neuen Assistant-Run mit JSON-Kontext...");

            // neuen Thread erstellen
            const newThread = await fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });
            const newThreadData = await newThread.json();
            const newThreadId = newThreadData?.id;

            await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                role: "user",
                content: `Frage: ${message}\n\nNutze diese Informationen aus Google als Kontext (strukturierter JSON-Auszug):\n\n${JSON.stringify(
                  googleResults.slice(0, 3),
                  null,
                  2
                )}`,
              }),
            });

            const secondRunRes = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs`, {
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

            const secondRunData = await secondRunRes.json();
            const secondRunId = secondRunData?.id;

            // warte auf zweiten Run
            let secondCompleted = false;
            let secondAttempts = 0;
            while (!secondCompleted && secondAttempts < 20) {
              await new Promise((r) => setTimeout(r, 1000));
              const check = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs/${secondRunId}`, {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              });
              const checkData = await check.json();
              if (checkData.status === "completed") {
                secondCompleted = true;
              }
              secondAttempts++;
            }

            const finalMessages = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });

            const finalMessagesData = await finalMessages.json();
            const finalMsg = finalMessagesData.data?.find((msg: any) => msg.role === "assistant");
            finalAnswer = finalMsg?.content?.[0]?.text?.value || finalAnswer;
          }

          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(finalAnswer),
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
                    content:
                      "❗ Die Antwort konnte nicht geladen werden. Bitte versuche es erneut.",
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