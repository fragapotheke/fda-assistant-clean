// src/services/googleSearch.ts
const API_KEY = process.env.GOOGLE_CSE_API_KEY!;
const CX = process.env.GOOGLE_CSE_CX!;

export async function searchGoogle(query: string) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error("❌ Google Search API Error:", await res.text());
    return [];
  }

  const data = await res.json();
  const results = data.items?.map((item: any) => ({
    title: item.title,
    snippet: item.snippet,
    link: item.link,
  })) ?? [];

  return results;
}