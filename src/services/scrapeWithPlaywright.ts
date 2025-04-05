import { chromium } from "playwright";

export async function scrapePageContent(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    const content = await page.evaluate(() => document.body.innerText);
    return content;
  } catch (error) {
    console.error("❗ Fehler beim Scraping:", error);
    return "❗ Inhalt konnte nicht geladen werden.";
  } finally {
    await browser.close();
  }
}