import { NextRequest, NextResponse } from "next/server";
import { chromium } from "playwright";

export async function POST(req: NextRequest) {
  const { urls } = await req.json();

  if (!Array.isArray(urls)) {
    return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
  }

  try {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const results: string[] = [];

    for (const url of urls) {
      const page = await context.newPage();
      await page.goto(url, { timeout: 15000 });
      const content = await page.textContent("body");
      results.push(content?.slice(0, 2000) || "❌ Kein Inhalt geladen");
      await page.close();
    }

    await browser.close();

    return NextResponse.json({ results });
  } catch (error) {
    console.error("❗ Fehler beim Scraping:", error);
    return NextResponse.json({ error: "Scraping fehlgeschlagen" }, { status: 500 });
  }
}