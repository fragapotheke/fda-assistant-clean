"use client";

import React, { useState } from "react";
import useOpenAIStore from "@/services/useOpenAIStore";
import { IDetailsWidget } from "@livechat/agent-app-sdk";

export default function Chat({ widget }: { widget: IDetailsWidget }) {
  const { chats, typing, message, typeMessage, getSmartAnswer, getIngredientsAnswer } = useOpenAIStore();

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await getSmartAnswer(widget);
  };

  const handleIngredientsClick = async () => {
    if (!message.trim()) return;
    await getIngredientsAnswer(widget);
  };

  const handleCopy = (text: string, index: number) => {
    const cleanedText = text
      .split("\n")
      .filter((line) => !line.trim().toLowerCase().startsWith("quelle:"))
      .join("\n")
      .trim();
  
    navigator.clipboard.writeText(cleanedText).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1000);
      console.log("✅ In Zwischenablage kopiert (ohne Quellenzeile)");
    });
  };

  return (
    <div className="chat-main">
      <div className="chat-head">
        <div className="chat-head-user">
          <div className="chat-head-user-photo">
            <img src="/logo.png" alt="Logo" />
          </div>
          <div className="chat-head-user-name">
            <p>FRAG DIE APOTHEKE KI 4.0</p>
          </div>
        </div>
      </div>

      <div className="chat-body" id="ChatBody">
        {chats.map((chat, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: chat.message.type === "human" ? "flex-end" : "flex-start",
              alignItems: "center",
              gap: "10px",
              marginRight: chat.message.type === "human" ? "0" : "10px",
              marginLeft: chat.message.type === "ai" ? "0" : "10px",
            }}
          >
            <div className={`message ${chat.message.type === "human" ? "right" : ""}`}>
              {chat.message.data.content}
            </div>
            {chat.message.type === "ai" && (
              <button
                onClick={() => handleCopy(chat.message.data.content, index)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1rem",
                  padding: 0,
                  color: copiedIndex === index ? "#4CAF50" : "#999",
                  transition: "color 0.3s ease",
                }}
                title={copiedIndex === index ? "Kopiert!" : "Antwort kopieren"}
              >
                {copiedIndex === index ? "✅" : "📋"}
              </button>
            )}
          </div>
        ))}

        {typing && (
          <div className="message">
            <span className="typing typing-1" />
            <span className="typing typing-2" />
            <span className="typing typing-3" />
          </div>
        )}
      </div>

      <form
        className="chat-input-form"
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "10px",
          gap: "10px",
        }}
      >
        <textarea
          value={message}
          onChange={(e) => typeMessage(e.target.value)}
          placeholder="Deine Frage..."
          className="chat-input"
          rows={3}
          inputMode="text"
          style={{
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "16px",
            resize: "none",
            lineHeight: "1.4",
            maxHeight: "150px",
            overflowY: "auto",
            paddingRight: "60px",
          }}
        />
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#fb4f39",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ➤
          </button>
          <button
            type="button"
            onClick={handleIngredientsClick}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#2c7a7b",
              color: "#fff",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Inhaltsstoffe
          </button>
        </div>
      </form>
    </div>
  );
}