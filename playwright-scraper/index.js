const express = require("express");
const { chromium } = require("playwright");
const app = express();

app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls)) {
    return res.status(400).json({ error: "Ungültige URL-Liste" });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const results = [];

  for (const url of urls) {
    const page = await context.newPage();
    try {
      await page.goto(url, { timeout: 15000 });
      const content = await page.evaluate(() => document.body.innerText);
      results.push(`🔗 ${url}\n${content.slice(0, 2000)}...`);
    } catch (error) {
      console.error("❗ Fehler bei", url, error);
      results.push(`🔗 ${url}\n❌ Scraping fehlgeschlagen`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  res.json({ results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Playwright Scraper läuft auf Port ${PORT}`);
});