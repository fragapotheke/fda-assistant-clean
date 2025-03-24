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
          if (!threadId) throw new Error("Thread-Erstellung fehlgeschlagen.");

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
          const googlePromise = searchGoogleJSON(userMessage);

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
          if (!runId) throw new Error("Run konnte nicht gestartet werden.");

          // Assistant-Antwort mit Timeout (20s)
          let completed = false;
          let attempts = 0;
          while (!completed && attempts < 20) {
            await new Promise((r) => setTimeout(r, 1000));
            console.log(`⏳ Assistant-Run: Versuch ${attempts + 1}/20`);
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
          const lastMessage = messagesData.data?.find(
            (msg: any) => msg.role === "assistant"
          );
          let assistantMessage = lastMessage?.content?.[0]?.text?.value || "";

          console.log("🤖 Assistant-Antwort:", assistantMessage);

          const googleResults = await googlePromise;
          console.log("📎 Google-Ergebnisse als JSON:", googleResults);

          const isWeak =
            !assistantMessage ||
            assistantMessage.length < 100 ||
            assistantMessage.toLowerCase().includes("keine informationen") ||
            assistantMessage.toLowerCase().includes("offizielle website") ||
            assistantMessage.toLowerCase().includes("nicht gefunden") ||
            assistantMessage.toLowerCase().includes("ich bin mir nicht sicher");

          if (isWeak && googleResults.length > 0) {
            console.log("↩️ Assistant-Antwort zu schwach – starte neuen Assistant-Run mit JSON-Kontext...");

            const secondThreadRes = await fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });

            const newThreadData = await secondThreadRes.json();
            const newThreadId = newThreadData?.id;

            const prompt = `Bitte beantworte die folgende Nutzerfrage anhand der bereitgestellten Websuche (im JSON-Format). Nutze nur belastbare Informationen:

Frage: ${userMessage}

Websuche (JSON):
${JSON.stringify(googleResults.slice(0, 3), null, 2)}

Wenn nach Zusammensetzung oder Inhaltsstoffen gefragt wird, gib die Zusammensetzung als Liste aus. Wenn nach Wirkung oder medizinischer Information gefragt wird, fasse diese laienverständlich zusammen.`;

            await fetch(`https://api.openai.com/v1/threads/${newThreadId}/messages`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
              body: JSON.stringify({
                role: "user",
                content: prompt,
              }),
            });

            const run2Res = await fetch(`https://api.openai.com/v1/threads/${newThreadId}/runs`, {
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

            const run2Data = await run2Res.json();
            const run2Id = run2Data?.id;
            if (!run2Id) throw new Error("Zweiter Run fehlgeschlagen");

            // auf zweiten Run warten
            let run2Completed = false;
            let run2Attempts = 0;
            while (!run2Completed && run2Attempts < 20) {
              await new Promise((r) => setTimeout(r, 1000));
              console.log(`⏳ Zweiter Assistant-Run: Versuch ${run2Attempts + 1}/20`);
              const check2 = await fetch(
                `https://api.openai.com/v1/threads/${newThreadId}/runs/${run2Id}`,
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "OpenAI-Beta": "assistants=v2",
                  },
                }
              );
              const checkData2 = await check2.json();
              if (checkData2.status === "completed") {
                run2Completed = true;
              }
              run2Attempts++;
            }

            const finalMessagesRes = await fetch(
              `https://api.openai.com/v1/threads/${newThreadId}/messages`,
              {
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  "OpenAI-Beta": "assistants=v2",
                },
              }
            );

            const finalMessagesData = await finalMessagesRes.json();
            const finalMessage = finalMessagesData.data?.find(
              (msg: any) => msg.role === "assistant"
            );
            assistantMessage = finalMessage?.content?.[0]?.text?.value || assistantMessage;
          }

          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(assistantMessage),
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
          console.error("❗ Fehler im Assistant-Flow:", err);
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