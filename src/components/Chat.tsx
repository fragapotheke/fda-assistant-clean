"use client";

import React, { useRef, useEffect } from "react";
import useOpenAIStore from "@/services/useOpenAIStore";
import { IDetailsWidget } from "@livechat/agent-app-sdk";

export default function Chat({ widget }: { widget: IDetailsWidget }) {
  const { chats, typing, message, typeMessage, getMessage } = useOpenAIStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await getMessage(widget);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log("✅ In Zwischenablage kopiert");
    });
  };

  // Auto-Resize-Funktion
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  return (
    <div className="chat-main">
      <div className="chat-head">
        <div className="chat-head-user">
          <div className="chat-head-user-photo">
            <img src="/logo.png" alt="Logo" />
          </div>
          <div className="chat-head-user-name">
            <p>FRAG DIE APOTHEKE KI 3.0</p>
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
                onClick={() => handleCopy(chat.message.data.content)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "1rem",
                  padding: 0,
                  color: "#999",
                }}
                title="Antwort kopieren"
              >
                📋
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
          padding: "10px",
          alignItems: "center",
          boxSizing: "border-box",
        }}
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => typeMessage(e.target.value)}
          placeholder="Deine Frage..."
          className="chat-input"
          rows={1}
          style={{
            flexGrow: 1,
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontSize: "14px",
            marginRight: "10px",
            resize: "none",
            overflow: "hidden",
            maxHeight: "200px",
          }}
        />
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
          Senden
        </button>
      </form>
    </div>
  );
}