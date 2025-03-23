// src/components/GoogleSearchTest.tsx

"use client";

import React, { useState } from "react";
import { searchGoogleJSON } from "@/services/googleSearch";

export default function GoogleSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const res = await searchGoogleJSON(query);
    setResults(res);
    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>🔍 Google-Suche testen</h2>

      <input
        type="text"
        placeholder="Suchbegriff eingeben"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ padding: "0.5rem", width: "100%", marginBottom: "1rem" }}
      />

      <button
        onClick={handleSearch}
        style={{
          backgroundColor: "#333",
          color: "#fff",
          padding: "0.5rem 1rem",
          border: "none",
          cursor: "pointer",
          marginBottom: "1rem",
        }}
      >
        Jetzt suchen
      </button>

      {loading && <p>🔄 Suche läuft...</p>}

      <div style={{ marginTop: "1rem" }}>
        {results.map((result, index) => (
          <div
            key={index}
            style={{
              marginBottom: "1rem",
              backgroundColor: "#f7f7f7",
              padding: "1rem",
              borderRadius: "4px",
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: result }} />
          </div>
        ))}
      </div>
    </div>
  );
}