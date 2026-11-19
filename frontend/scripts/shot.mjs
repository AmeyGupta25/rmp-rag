// Screenshots the Search page and a flipped card at desktop and phone width, into screenshots/.
// Needs the API on :8000 and `npm run dev -- --port 3000` (the API only allows localhost:3000).
// Usage: npm run shot [-- "Professor Name"]   (no name flips the first card)
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const who = process.argv[2];
const url = process.env.SHOT_URL ?? "http://localhost:3000/search";
await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
try {
  for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844]]) {
    // reduced motion turns off the flip and count-up animations, so nothing is caught mid-move
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await page.goto(who ? `${url}?q=${encodeURIComponent(who)}` : url);
    await page.getByRole("button", { name: who ? `Flip ${who}'s card for details` : /^Flip .+'s card for details$/ }).first().click();
    await page.getByRole("button", { name: "Flip back" }).first().waitFor();
    await page.screenshot({ path: `screenshots/${name}-page.png` });
    await page.locator(".card.flipped").first().screenshot({ path: `screenshots/${name}-card.png` });
    await page.close();
  }
  console.log("Saved to frontend/screenshots/");
} finally {
  await browser.close();
}
