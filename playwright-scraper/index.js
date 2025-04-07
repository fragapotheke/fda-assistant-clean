const express = require("express");
const { chromium } = require("playwright");
const app = express();
const cors = require("cors");

app.use(cors());
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

      const content = await page.evaluate(() => {
        const root = document.querySelector("#pflichtangaben");
        if (!root) return "❌ Bereich '#pflichtangaben' nicht gefunden.";

        function getListAfterTitle(title) {
          const paragraphs = Array.from(root.querySelectorAll("p"));
          const heading = paragraphs.find(p =>
            p.textContent.trim().toLowerCase().includes(title.toLowerCase())
          );
          if (!heading) return "Nicht gefunden.";

          // Nächstes Element suchen (UL-Liste)
          let next = heading.nextElementSibling;
          while (next && next.tagName.toLowerCase() !== "ul") {
            next = next.nextElementSibling;
          }

          if (!next) return "Nicht gefunden.";

          return Array.from(next.querySelectorAll("li"))
            .map(li => "• " + li.textContent.trim())
            .join("\n");
        }

        const wirkstoffe = getListAfterTitle("wirkstoff");
        const hilfsstoffe = getListAfterTitle("hilfsstoff");

        return `💊 Wirkstoffe:\n${wirkstoffe}\n\n🧪 Hilfsstoffe:\n${hilfsstoffe}`;
      });

      results.push(`🔗 ${url}\n${content}`);
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

// Cloud Run verlangt Port 8080 – ohne Fallback!
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`✅ Playwright Scraper läuft auf Port ${PORT}`);
});