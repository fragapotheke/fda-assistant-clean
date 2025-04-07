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

// 🌿 Intelligente Inhaltsstoff-Suche – zuerst docmorris.de, dann ihreapotheken.de als Fallback
export async function searchIngredientsOnly(produktname: string): Promise<GoogleResult[]> {
  const firstWord = produktname.split(" ")[0].toLowerCase();
  const isMatch = (text: string) => text.toLowerCase().includes(firstWord);

  // 1. Primäre Suche auf DocMorris
  const docMorrisQuery = `site:docmorris.de ${produktname} Inhaltsstoffe`;
  let url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(docMorrisQuery)}`;

  let res = await fetch(url);
  let data = await res.json();

  if (data.items && data.items.length > 0) {
    const filtered = data.items.filter((item: any) => isMatch(item.title) || isMatch(item.snippet));
    if (filtered.length > 0) {
      const results: GoogleResult[] = filtered.slice(0, 3).map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link,
      }));
      console.log("🔍 Inhaltsstoff-Suche – DocMorris:", results.map((r) => r.url));
      return results;
    }
  }

  // 2. Fallback auf ihreapotheken.de
  console.warn("⚠️ Keine relevanten DocMorris-Ergebnisse, starte Fallback auf ihreapotheken.de");

  const fallbackQuery = `site:ihreapotheken.de ${produktname} Inhaltsstoffe`;
  url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(fallbackQuery)}`;

  res = await fetch(url);
  data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.warn("❌ Keine Inhalte auf ihreapotheken.de gefunden");
    return [];
  }

  const filteredFallback = data.items.filter((item: any) => isMatch(item.title) || isMatch(item.snippet));
  if (filteredFallback.length === 0) {
    console.warn("❌ Kein passender Treffer im Fallback gefunden");
    return [];
  }

  const fallbackResults: GoogleResult[] = filteredFallback.slice(0, 3).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }));

  console.log("🔍 Inhaltsstoff-Suche – Fallback:", fallbackResults.map((r) => r.url));
  return fallbackResults;
}