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

// 🌿 Intelligente Inhaltsstoff-Suche auf ihreapotheken.de mit Fallback
export async function searchIngredientsOnly(produktname: string): Promise<GoogleResult[]> {
  // 1. Primäre Suche – exakter Produktname im URL
  const exactQuery = `site:ihreapotheken.de inurl:/produkt/ "${produktname}" Inhaltsstoffe`;
  let url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(exactQuery)}`;

  let res = await fetch(url);
  let data = await res.json();

  if (data.items && data.items.length > 0) {
    const results: GoogleResult[] = data.items.slice(0, 3).map((item: any) => ({
      title: item.title,
      snippet: item.snippet,
      url: item.link,
    }));

    console.log("🔍 Inhaltsstoff-Suche (exakt):", results.map((r) => r.url));
    return results;
  }

  // 2. Fallback – weichere Suche ohne inurl + Anführungszeichen
  console.warn("⚠️ Exakte Suche ohne Treffer, starte Fallback");

  const fallbackQuery = `site:ihreapotheken.de ${produktname} Inhaltsstoffe`;
  url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(fallbackQuery)}`;

  res = await fetch(url);
  data = await res.json();

  if (!data.items || data.items.length === 0) {
    console.warn("❌ Keine Inhalte auf ihreapotheken.de gefunden");
    return [];
  }

  const fallbackResults: GoogleResult[] = data.items.slice(0, 3).map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    url: item.link,
  }));

  console.log("🔍 Inhaltsstoff-Suche (Fallback):", fallbackResults.map((r) => r.url));
  return fallbackResults;
}