import { IDetailsWidget } from "@livechat/agent-app-sdk";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import removeMarkdown from "remove-markdown";
import { searchGoogle, searchIngredientsOnly } from "./googleSearch";

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

export interface MessageData {
  content: string;
  is_chunk: boolean;
  type: ChatType;
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
              content: message,
              type: "human",
            },
          },
        ],
        message: "",
      }));

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

        if (isStrong) {
          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: removeMarkdown(vectorAnswer + "\n\nQuelle: Datenbank"),
                    is_chunk: false,
                    type: "ai",
                  },
                  content: removeMarkdown(vectorAnswer + "\n\nQuelle: Datenbank"),
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
                    is_chunk: false,
                    type: "ai",
                  },
                  content: removeMarkdown(gptAnswer + "\n\nQuelle: Google"),
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
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
              content: message,
              type: "human",
            },
          },
        ],
        message: "",
      }));

      try {
        const spezialResults = await searchIngredientsOnly(message);
        const urls = spezialResults.map((r) => r.url);

        const baseUrl =
          typeof window === "undefined"
            ? process.env.NEXT_PUBLIC_SITE_URL || "https://fda-assistant-clean.vercel.app"
            : "";

        const res = await fetch(`${baseUrl}/api/scrape-ingredients`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls }),
        });

        const data = await res.json();
        const extracted = data.results?.join("\n\n") || "❌ Keine Stoffe gefunden.";

        const gptAnswer = await runAssistantWithGoogle(message, extracted);

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
                content: removeMarkdown(gptAnswer + "\n\nQuelle: Google"),
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

// Scraping via API für allgemeine Suche
async function runGoogleSearch(message: string): Promise<string> {
  const results = await searchGoogle(message);
  const urls = results.map((r) => r.url);
  const fullTexts = await fetchScrapedPagesFromAPI(urls);

  return fullTexts
    .map((text, i) => `📄 Seite ${i + 1}:\n🔗 ${urls[i]}\n${text.slice(0, 2000)}...`)
    .join("\n\n");
}

async function fetchScrapedPagesFromAPI(urls: string[]): Promise<string[]> {
  try {
    const baseUrl =
      typeof window === "undefined"
        ? process.env.NEXT_PUBLIC_SITE_URL || "https://fda-assistant-clean.vercel.app"
        : "";

    const res = await fetch(`${baseUrl}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });

    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.error("❗ Fehler beim Abrufen gescrapter Inhalte:", error);
    return urls.map(() => "❌ Scraping fehlgeschlagen");
  }
}