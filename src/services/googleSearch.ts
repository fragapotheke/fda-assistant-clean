<<<<<<< HEAD
// src/services/googleSearch.ts

export async function searchGoogleJSON(query: string): Promise<string[]> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CSE_API_KEY!;
  const cx = process.env.NEXT_PUBLIC_GOOGLE_CSE_CX!;

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      console.warn("❗ Keine Ergebnisse von Google CSE erhalten", data);
      return [];
    }

    // Rückgabe als strukturierte HTML-Blöcke (JSON-kompatibel)
    return data.items.map((item: any) => {
      return `🔗 <strong>${item.title}</strong><br>${item.snippet}<br><a href="${item.link}" target="_blank">Quelle anzeigen</a>`;
    });
  } catch (error) {
    console.error("❗ Fehler bei Google Websuche:", error);
    return ["❗ Es gab ein Problem bei der Websuche."];
  }
}

// ✅ Alias-Export für Kompatibilität mit bestehendem Code
export { searchGoogleJSON as searchGoogle };
=======
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CSE_API_KEY!;
const cx = process.env.NEXT_PUBLIC_GOOGLE_CSE_CX!;

export interface GoogleResult {
  title: string;
  snippet: string;
  url: string;
}

// 🌐 Standard-Google-Suche (Top 3 Treffer)
export async function searchGoogle(query: string): Promise<GoogleResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items) {
    console.warn("⚠️ Keine Google-Ergebnisse gefunden");
    return [];
  }

  return data.items.slice(0, 3).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }));
}

// 🌿 Spezialsuche nur auf Arzneimittel-Webseiten für Inhaltsstoffe
export async function searchIngredientsOnly(query: string): Promise<GoogleResult[]> {
  const spezialQuery = `${query} Inhaltsstoffe site:ihreapotheken.de OR site:shop-apotheke.com OR site:apotheken-umschau.de`;

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(spezialQuery)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items) {
    console.warn("⚠️ Keine spezialisierten Inhaltsstoff-Ergebnisse gefunden");
    return [];
  }

  return data.items.slice(0, 3).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }));
}
>>>>>>> 0fade2e (🚀 Inhaltsstoff-Button & Google-Suche aktualisiert)
