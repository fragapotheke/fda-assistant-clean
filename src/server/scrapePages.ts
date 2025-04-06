import { scrapePage } from "./scrapePage";

// Ruft mehrere Seiten auf und extrahiert den Text
export async function scrapeMultiplePages(urls: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const url of urls) {
    try {
      console.log(`🌐 Lade Inhalt von: ${url}`);
      const content = await scrapePage(url);
      results.push(`🔗 ${url}\n${content.slice(0, 3000)}...`); // Optional kürzen
    } catch (error) {
      console.error(`❌ Fehler beim Scrapen von ${url}:`, error);
      results.push(`🔗 ${url}\n⚠️ Fehler beim Laden der Seite.`);
    }
  }

  return results;
}