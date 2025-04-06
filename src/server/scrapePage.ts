// server/scrapePage.ts

import { chromium } from "playwright";

export async function scrapePage(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });

    // Entferne störende UI-Elemente, wenn nötig (z. B. Cookie-Banner)
    await page.evaluate(() => {
      const selectorsToRemove = [
        "#cookie-banner", 
        ".cookie-consent", 
        "footer",
        "nav"
      ];
      selectorsToRemove.forEach((selector) => {
        const el = document.querySelector(selector);
        if (el) el.remove();
      });
    });

    // Extrahiere den Hauptinhalt der Seite
    const content = await page.evaluate(() => {
      return document.body.innerText;
    });

    return content.trim();
  } catch (error) {
    console.error("❗ Fehler beim Scraping:", error);
    return "❗ Fehler beim Scraping der Seite.";
  } finally {
    await browser.close();
  }
}