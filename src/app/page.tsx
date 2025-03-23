"use client";

import React from "react";
import GoogleSearchTest from "../components/GoogleSearchTest"; // Oder "@/components/GoogleSearchTest", falls du Aliase nutzt

export default function Page() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h2>🔍 Google-Suche testen</h2>
      <GoogleSearchTest />
    </main>
  );
}