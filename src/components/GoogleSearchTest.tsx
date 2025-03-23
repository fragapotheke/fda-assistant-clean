// src/components/GoogleSearchTest.tsx
"use client";

import React, { useState } from "react";
import { searchGoogleJSON } from "@/services/googleSearch";

export default function GoogleSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const data = await searchGoogleJSON(query);
    setResults(data);
    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>🔍 Google-Suche testen</h2>

      <input
        type="text"
        placeholder="Suchbegriff eingeben..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          padding: "0.5rem",
          fontSize: "1rem",
          width: "100%",
          marginBottom: "1rem",
        }}
      />

      <button
        onClick={handleSearch}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          backgroundColor: "#0070f3",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Jetzt suchen
      </button>

      {loading && <p>⏳ Suche läuft...</p>}

      <ul style={{ marginTop: "1rem", lineHeight: "1.6" }}>
        {results.map((item, idx) => (
          <li key={idx}>
            <div dangerouslySetInnerHTML={{ __html: item }} />
          </li>
        ))}
      </ul>
    </div>
  );
}