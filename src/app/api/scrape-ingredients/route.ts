import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";

export async function POST(req: NextRequest) {
  const { urls } = await req.json();

  if (!Array.isArray(urls)) {
    return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
  }

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const results: string[] = [];

    for (const url of urls) {
      const page = await context.newPage();
      await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });

      const content = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const wirkstoffeMatch = bodyText.match(/wirkstoffe.*?(?=\n|$)/i);
        const hilfsstoffeMatch = bodyText.match(/hilfsstoffe.*?(?=\n|$)/i);

        const result = [];
        if (wirkstoffeMatch) result.push("💊 " + wirkstoffeMatch[0]);
        if (hilfsstoffeMatch) result.push("🧪 " + hilfsstoffeMatch[0]);

        return result.join("\n") || "❌ Keine spezifischen Stoffe gefunden.";
      });

      results.push(`🔗 ${url}\n${content}`);
      await page.close();
    }

    await browser.close();

    return NextResponse.json({ results });
  } catch (error) {
    console.error("❗ Fehler beim gezielten Scraping:", error);
    return NextResponse.json({ error: "Scraping fehlgeschlagen" }, { status: 500 });
  }
}