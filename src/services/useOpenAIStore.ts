// src/services/useOpenAIStore.ts

import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";
import { searchGoogleJSON as searchGoogle } from "@/services/googleSearch";

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

          console.log("🌐 Starte Google-Suche...");
          const googlePromise = searchGoogle(userMessage);

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

          // ⏳ Antwort abwarten mit Timeout
          let assistantMessage = "";
          let completed = false;
          let attempts = 0;
          const maxAttempts = 15;

          while (!completed && attempts < maxAttempts) {
            console.log(`⏳ Assistant-Run: Versuch ${attempts + 1}/${maxAttempts}`);
            await new Promise((r) => setTimeout(r, 1000));
            const check = await fetch(
              `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              }
            );
            const checkData = await check.json();
            if (checkData.status === "completed") {
              completed = true;
              break;
            }
            attempts++;
          }

          if (!completed) throw new Error("Run wurde nicht rechtzeitig abgeschlossen");

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
          const lastMessage = messagesData.data?.find((m: any) => m.role === "assistant");

          assistantMessage = lastMessage?.content?.[0]?.text?.value || "";
          console.log("🤖 Assistant-Antwort:", assistantMessage);

          const googleResults = await googlePromise;
          console.log("📎 Google-Ergebnisse als JSON:", googleResults);

          const isWeak =
            !assistantMessage ||
            assistantMessage.length < 100 ||
            /keine information|nicht gefunden|offizielle website/.test(
              assistantMessage.toLowerCase()
            );

          let finalAnswer = assistantMessage;

          if (isWeak && googleResults.length > 0) {
            console.log("↩️ Assistant-Antwort zu schwach – starte neuen Assistant-Run mit JSON-Kontext...");

            const followUpPrompt = userMessage.toLowerCase().includes("inhaltsstoffe") ||
              userMessage.toLowerCase().includes("zusammensetzung")
              ? `Bitte extrahiere aus diesen Web-Ergebnissen die genaue Zusammensetzung des Produkts in strukturierter Listenform:\n\n${googleResults
                  .slice(0, 3)
                  .join("\n\n")}`
              : `Bitte fasse die wichtigsten Informationen aus diesen Suchergebnissen verständlich und korrekt zusammen:\n\n${googleResults
                  .slice(0, 3)
                  .join("\n\n")}`;

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
                content: followUpPrompt,
              }),
            });

            const secondRun = await fetch(
              `https://api.openai.com/v1/threads/${newThreadId}/runs`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
                body: JSON.stringify({ assistant_id: assistantId }),
              }
            );

            const secondRunData = await secondRun.json();
            const secondRunId = secondRunData?.id;

            let secondCompleted = false;
            let secondAttempts = 0;
            while (!secondCompleted && secondAttempts < maxAttempts) {
              console.log(`⏳ Zweiter Assistant-Run: Versuch ${secondAttempts + 1}/${maxAttempts}`);
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
              if (checkData.status === "completed") secondCompleted = true;
              secondAttempts++;
            }

            const finalRes = await fetch(
              `https://api.openai.com/v1/threads/${newThreadId}/messages`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              }
            );
            const finalData = await finalRes.json();
            const finalMsg = finalData.data?.find((msg: any) => msg.role === "assistant");
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