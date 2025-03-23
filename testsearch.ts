import "dotenv/config"; // ⬅️ .env.local wird damit geladen
import { searchGoogle } from "./src/services/googleSearch";

(async () => {
  const result = await searchGoogle("Was ist in Pure Encapsulations Anti-Stress enthalten?");
  console.log("🌐 Test Websuche Ergebnis:\n", result.join("\n\n"));
})();