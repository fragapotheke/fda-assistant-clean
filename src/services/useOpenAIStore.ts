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
    "wenn sie spezifische informationen",
  ];
  const textLower = text.toLowerCase();
  return !schwachePhrasen.some((phrase) => textLower.includes(phrase));
}

// Entfernt OpenAI-Marker wie   ohne andere Inhalte zu beeinträchtigen
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
          runVectorSearch(message).catch(() => null),
          runGoogleSearch(message).catch(() => null),
        ]);

        const isStrong = vectorAnswer && isAnswerStrong(vectorAnswer);

        const answer = isStrong
          ? cleanGptArtifacts(removeMarkdown(vectorAnswer)) + "\n\nQuelle: Datenbank"
          : cleanGptArtifacts(
              removeMarkdown(await runAssistantWithGoogle(message, googleAnswer || ""))
            ) + "\n\nQuelle: Google";

        set((prev) => ({
          chats: [
            ...prev.chats,
            {
              message: {
                data: { content: answer, is_chunk: false, type: "ai" },
                content: answer,
                type: "ai",
              },
            },
          ],
          typing: false,
        }));
      } catch {
        set({ typing: false });
      }
    },

    getIngredientsAnswer: async (widget: IDetailsWidget) => {
      const rawQuery = get().message;
      if (!rawQuery || !assistantId) return;

      const message = `Welche Inhaltsstoffe enthält ${rawQuery}?`;

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
                  content:
                    cleanGptArtifacts(removeMarkdown(gptAnswer)) + "\n\nQuelle: Google",
                  is_chunk: false,
                  type: "ai",
                },
                content:
                  cleanGptArtifacts(removeMarkdown(gptAnswer)) + "\n\nQuelle: Google",
                type: "ai",
              },
            },
          ],
          typing: false,
        }));
      } catch {
        set({ typing: false });
      }
    },
  }))
);

export default useOpenAIStore;

async function runAssistantWithGoogle(userMessage: string, googleResults: string): Promise<string> {
  const threadRes = await fetch("https://api.openai.com/v1/threads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
    },
  });

  const threadId = (await threadRes.json()).id;

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

  const runId = (await runRes.json()).id;

  let completed = false;
  let attempts = 0;

  while (!completed && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
    if ((await res.json()).status === "completed") completed = true;
    attempts++;
  }

  const messages = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
    },
  });

  const msgData = await messages.json();
  const lastMsg = msgData.data?.find((msg: any) => msg.role === "assistant");
  return lastMsg?.content?.[0]?.text?.value || "❌ Keine GPT-Antwort.";
}

async function runVectorSearch(message: string): Promise<string> {
  const threadId = (await (
    await fetch("https://api.openai.com/v1/threads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
    })
  ).json()).id;

  await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
    },
    body: JSON.stringify({ role: "user", content: message }),
  });

  const runId = (await (
    await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ assistant_id: assistantId }),
    })
  ).json()).id;

  let completed = false;
  let attempts = 0;
  while (!completed && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );
    if ((await res.json()).status === "completed") completed = true;
    attempts++;
  }

  const messages = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
    },
  });

  const msgData = await messages.json();
  const lastMsg = msgData.data?.find((msg: any) => msg.role === "assistant");
  return lastMsg?.content?.[0]?.text?.value || "❌ Keine Antwort von Assistant erhalten.";
}

async function runGoogleSearch(message: string): Promise<string> {
  const results = await searchGoogle(message);
  return results
    .map((r, i) => `📄 Seite ${i + 1}:\n${r.title}\n${r.snippet}\n🔗 ${r.url}`)
    .join("\n\n");
}