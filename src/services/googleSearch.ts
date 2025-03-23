"use client";

import React, { useState } from "react";
import { searchGoogleJSON } from "@/services/googleSearch";

export default function GoogleSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { title: string; link: string; snippet: string }[]
  >([]);

  const handleSearch = async () => {
    const data = await searchGoogleJSON(query);
    setResults(data);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>🔍 Google-Suche testen</h2>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Suchbegriff eingeben"
        style={{
          padding: "0.5rem",
          fontSize: "1rem",
          width: "100%",
          maxWidth: "400px",
          marginBottom: "1rem",
        }}
      />

      <button
        onClick={handleSearch}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          background: "#0070f3",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Jetzt suchen
      </button>

      <div style={{ marginTop: "2rem" }}>
        {results.map((item, index) => (
          <div key={index} style={{ marginBottom: "1.5rem" }}>
            <p>
              🔗 <strong>{item.title}</strong>
            </p>
            <p>{item.snippet}</p>
            <a href={item.link} target="_blank" rel="noopener noreferrer">
              Quelle anzeigen
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}