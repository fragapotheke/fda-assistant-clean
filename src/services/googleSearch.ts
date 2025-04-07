
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
  const normalized = produktname.toLowerCase().replace(/-/g, " ");
  const hauptname = normalized.split(" ")[0];

  const isMatch = (text: string) => text.toLowerCase().includes(hauptname);

  // 1. Primäre Suche auf DocMorris
  const docMorrisQuery = `site:docmorris.de ${produktname} Inhaltsstoffe`;
  let url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(docMorrisQuery)}`;

  let res = await fetch(url);
  let data = await res.json();

  if (data.items && data.items.length > 0) {
    const match = data.items.find((item: any) =>
      isMatch(item.title) || isMatch(item.snippet)
    );

    if (match) {
      const result: GoogleResult = {
        title: match.title,
        snippet: match.snippet,
        url: match.link,
      };
      console.log("🔍 Inhaltsstoff-Suche – DocMorris Match:", result.url);
      return [result];
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

  const match = data.items.find((item: any) =>
    isMatch(item.title) || isMatch(item.snippet)
  );

  if (!match) {
    console.warn("❌ Kein passender Treffer im Fallback gefunden");
    return [];
  }

  const fallbackResult: GoogleResult = {
    title: match.title,
    snippet: match.snippet,
    url: match.link,
  };

  console.log("🔍 Inhaltsstoff-Suche – Fallback Match:", fallbackResult.url);
  return [fallbackResult];
}
