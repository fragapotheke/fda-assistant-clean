// src/services/useOpenAIStore.ts

import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";
<<<<<<< HEAD
import { searchGoogleJSON as searchGoogle } from "@/services/googleSearch";
=======
import { searchGoogle, searchIngredientsOnly } from "./googleSearch";
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)

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
  content: string;
  example?: boolean;
  is_chunk?: boolean;
  additional_kwargs?: AdditionalKwargs;
}

export interface AdditionalKwargs {}

function isAnswerStrong(text: string): boolean {
  const schwachePhrasen = [
    "könnte enthalten",
    "je nach hersteller",
    "kann variieren",
    "typische inhaltsstoffe",
    "eventuell",
    "es ist wichtig zu beachten",
    "lesen sie die packungsbeilage",
    "hilfsstoffe sind in der regel",
    "in der regel",
    "gehört zur gruppe der nsar",
    "bei weiteren fragen",
    "lassen sie es mich wissen",
    "empfehle ich",
    "wenn sie spezifische informationen"
  ];
  const textLower = text.toLowerCase();
  return !schwachePhrasen.some((phrase) => textLower.includes(phrase));
}

function cleanGptArtifacts(text: string): string {
  return text.replace(/【\d+:\d+†source】/g, "").trim();
}

const initialState = {
  chats: [] as Chats,
  typing: false,
  message: "",
};

const useOpenAIStore = create(
<<<<<<< HEAD
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
=======
  combine(initialState, (set, get) => ({
    typeMessage: (message: string) => set({ message }),

    getSmartAnswer: async (widget: IDetailsWidget) => {
      const message = get().message;
      if (!message || !assistantId) return;

      console.log("🚀 getSmartAnswer gestartet mit:", message);

      set((prev) => ({
        typing: true,
        chats: [
          ...prev.chats,
          {
            message: {
              data: { content: message, is_chunk: false, type: "human" },
              type: "human",
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)
            },
          },
        ],
        message: "",
      }));

<<<<<<< HEAD
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
=======
      try {
        const [vectorAnswer, googleAnswer] = await Promise.all([
          runVectorSearch(message).catch((err) => {
            console.error("❗ Fehler bei Vector:", err);
            return null;
          }),
          runGoogleSearch(message).catch((err) => {
            console.error("❗ Fehler bei Google:", err);
            return null;
          }),
        ]);

        const isStrong = vectorAnswer && isAnswerStrong(vectorAnswer);
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)

        if (isStrong) {
          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
<<<<<<< HEAD
                    content: removeMarkdown(finalAnswer),
=======
                    content: removeMarkdown(vectorAnswer + "\n\nQuelle: Datenbank"),
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
        } else {
          const gptAnswer = await runAssistantWithGoogle(message, googleAnswer || "");
          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(gptAnswer + "\n\nQuelle: Google"),
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
<<<<<<< HEAD
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
=======
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)
        }
      } catch (error) {
        console.error("❗ Fehler bei getSmartAnswer:", error);
        set({ typing: false });
      }
    },

    getIngredientsAnswer: async (widget: IDetailsWidget) => {
      const rawQuery = get().message;
      if (!rawQuery || !assistantId) return;

      const message = `Welche Inhaltsstoffe enthält ${rawQuery}?`;
      console.log("🍃 Inhaltsstoff-Suche gestartet mit:", message);

      set((prev) => ({
        typing: true,
        chats: [
          ...prev.chats,
          {
            message: {
              data: { content: message, is_chunk: false, type: "human" },
              type: "human",
            },
          },
        ],
        message: "",
      }));

      try {
        const spezialResults = await searchIngredientsOnly(message);
        console.log("🍃 Spezial-Inhaltsstoff-Ergebnisse:", spezialResults);

        const googleFormatted = spezialResults
          .map((r, i) => `🔎 Ergebnis ${i + 1}:\n${r.title}\n${r.snippet}\n${r.url}`)
          .join("\n\n");

        const gptAnswer = await runAssistantWithGoogle(message, googleFormatted);

        set((prev) => ({
          chats: [
            ...prev.chats,
            {
              message: {
                data: {
                  content: removeMarkdown(gptAnswer + "\n\nQuelle: Google"),
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
        console.error("❗ Fehler bei getIngredientsAnswer:", error);
        set({ typing: false });
      }
    },
  }))
);

export default useOpenAIStore;

// GPT mit Google-Ergebnissen
async function runAssistantWithGoogle(userMessage: string, googleResults: string): Promise<string> {
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
      content: `Bitte beantworte folgende Frage auf Basis dieser Google-Ergebnisse:\n\n${googleResults}\n\nFrage: ${userMessage}`,
    }),
  });

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

  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 15) {
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
  const lastMessage = messagesData.data?.find((msg: any) => msg.role === "assistant");
  const rawAnswer = lastMessage?.content?.[0]?.text?.value || "❌ Keine GPT-Antwort.";
  return cleanGptArtifacts(rawAnswer);
}

// Vector Search
async function runVectorSearch(message: string): Promise<string> {
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
    body: JSON.stringify({ role: "user", content: message }),
  });

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

  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 15) {
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
  const lastMessage = messagesData.data?.find((msg: any) => msg.role === "assistant");
  return lastMessage?.content?.[0]?.text?.value || "❌ Keine Antwort von Assistant erhalten.";
}

// Google-Suche Standard
async function runGoogleSearch(message: string): Promise<string> {
  const results = await searchGoogle(message);
  return results
    .map((r, i) => `🔎 Ergebnis ${i + 1}:\n${r.title}\n${r.snippet}\n${r.url}`)
    .join("\n\n");
}