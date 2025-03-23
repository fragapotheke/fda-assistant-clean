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

    return data.items.slice(0, 3).map((item: any) => {
      return `<b>🔗 ${item.title}</b><br>${item.snippet}<br><a href="${item.link}" target="_blank">Quelle anzeigen</a>`;
    });
  } catch (error) {
    console.error("❗ Fehler bei Google Websuche:", error);
    return ["❗ Es gab ein Problem bei der Websuche."];
  }
}