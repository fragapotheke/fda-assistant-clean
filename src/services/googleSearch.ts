// src/services/googleSearch.ts

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

// 🌿 Spezialsuche NUR auf ihreapotheken.de
export async function searchIngredientsOnly(query: string): Promise<GoogleResult[]> {
  const spezialQuery = `${query} Inhaltsstoffe site:ihreapotheken.de`;

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(spezialQuery)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.items) {
    console.warn("⚠️ Keine Inhalte auf ihreapotheken.de gefunden");
    return [];
  }

  return data.items.slice(0, 3).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }));
}