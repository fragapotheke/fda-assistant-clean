export async function scrapePageContent(url: string): Promise<string> {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { timeout: 20000 });
    const content = await page.content();
    await browser.close();
    return content;
  } catch (error) {
    console.error("❗ Fehler beim Scrapen:", error);
    await browser.close();
    return "❌ Fehler beim Laden der Seite.";
  }
}