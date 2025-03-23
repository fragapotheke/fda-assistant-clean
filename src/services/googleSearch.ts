const apiKey = process.env.NEXT_PUBLIC_GOOGLE_CSE_API_KEY!;
const cx = process.env.NEXT_PUBLIC_GOOGLE_CSE_CX!;

const searchGoogle = async (query: string): Promise<string> => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`
    );

    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      return "🔎 Keine passenden Informationen in der Websuche gefunden.";
    }

    const topResults = data.items.slice(0, 3);
    const resultText = topResults
      .map(
        (item: any) =>
          `🔗 **${item.title}**\n${item.snippet}\n[Quelle anzeigen](${item.link})\n`
      )
      .join("\n\n");

    return resultText;
  } catch (error) {
    console.error("❗ Fehler bei Google Websuche:", error);
    return "❗ Es gab ein Problem bei der Websuche.";
  }
};

export default searchGoogle;