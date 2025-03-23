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

        console.log("🧵 Starte neuen Assistant-Thread...");
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

        let threadId: string | null = null;
        let runId: string | null = null;

        const assistantTask = (async () => {
          try {
            console.log("📨 Sende Nutzernachricht an Assistant...");
            const threadRes = await fetch("https://api.openai.com/v1/threads", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "OpenAI-Beta": "assistants=v2",
              },
            });

            const threadData = await threadRes.json();
            threadId = threadData?.id;

            if (!threadId) throw new Error("Kein Thread erstellt");

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
            runId = runData?.id;

            if (!runId) throw new Error("Kein Run gestartet");

            let completed = false;
            let result;
            let attempts = 0;

            while (!completed && attempts < 12) {
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

            const content = lastMessage?.content?.[0]?.text?.value || "";
            console.log("🤖 Assistant-Antwort:", content);

            return removeMarkdown(content.trim());
          } catch (err) {
            console.error("❗ Fehler im Assistant-Flow:", err);
            return "";
          }
        })();

        const googleTask = (async () => {
          console.log("🌐 Starte Google-Suche...");
          const webResults = await searchGoogle(userMessage);
          const joined = webResults.join("\n\n");
          console.log("📎 Google-Ergebnisse:", joined);
          return joined;
        })();

        try {
          const timeout = (ms: number) =>
            new Promise<string>((_, reject) => setTimeout(() => reject("❗ Timeout überschritten"), ms));

          const result = await Promise.race([
            Promise.all([assistantTask, googleTask]),
            timeout(20000), // max. 20 Sekunden
          ]);

          const [assistantAnswer, googleAnswer] = result as string[];

          const isBadAnswer =
            !assistantAnswer ||
            assistantAnswer.length < 60 ||
            assistantAnswer.includes("keine informationen") ||
            assistantAnswer.includes("nicht sicher") ||
            assistantAnswer.includes("besuche die offizielle");

          const finalAnswer = isBadAnswer && googleAnswer ? googleAnswer : assistantAnswer;

          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: finalAnswer || "❗ Die Antwort konnte nicht geladen werden.",
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
        } catch (e) {
          console.error("❗ Assistant/Websuche Fehler:", e);
          set((prev) => ({
            chats: [
              ...prev.chats,
              {
                message: {
                  data: {
                    content: "❗ Die Antwort konnte nicht geladen werden. Bitte versuche es erneut.",
                    is_chunk: false,
                    type: "ai",
                  },
                  type: "ai",
                },
              },
            ],
            typing: false,
          }));
        }
      },

      typeMessage: (message: string) => set({ message }),
    })
  )
);

export default useOpenAIStore;