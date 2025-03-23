"use client";

import React, { useState } from "react";
import { searchGoogleJSON } from "@/services/googleSearch";

export default function GoogleSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
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
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Suchbegriff eingeben..."
        style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
      />

      <button
        onClick={handleSearch}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1rem",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Jetzt suchen
      </button>

      <div style={{ marginTop: "2rem" }}>
        {loading && <p>🔄 Suche läuft...</p>}
        {results.length > 0 && (
          <ul>
            {results.map((item, index) => (
              <li key={index} style={{ marginBottom: "1.5rem" }}>
                <strong>{item.title}</strong>
                <p>{item.snippet}</p>
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  Quelle anzeigen
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}