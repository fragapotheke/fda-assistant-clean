"use client";

import React, { useState } from "react";
import { searchGoogle } from "@/services/googleSearch";

export default function GoogleSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const res = await searchGoogle(query);
    setResults(res);
    setLoading(false);
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
          padding: "10px",
          fontSize: "16px",
          width: "100%",
          maxWidth: "400px",
          marginBottom: "1rem",
        }}
      />
      <br />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? "Suche läuft..." : "Jetzt suchen"}
      </button>
      <div style={{ marginTop: "2rem" }}>
        {results.length > 0 ? (
          <ul>
            {results.map((r, i) => (
              <li key={i} style={{ marginBottom: "1rem", fontSize: "14px" }}>
                <pre>{r}</pre>
              </li>
            ))}
          </ul>
        ) : loading ? null : (
          <p>Keine Ergebnisse</p>
        )}
      </div>
    </div>
  );
}