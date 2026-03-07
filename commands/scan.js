// commands/scan.js
// Copy-paste this whole file.
// ✅ Works for /scan
// ✅ Also exports runScan() so your index.js reply-"scan" can reuse it
// ✅ Handles many gamepass link formats
// ✅ Adds PH price check + "Regional pricing possibly on/off"
// ✅ Uses node-fetch if global fetch isn't available

const { SlashCommandBuilder } = require("discord.js");

// ---- fetch compatibility (works even if global fetch breaks) ----
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  // If you get an error here, run: npm i node-fetch
  fetchFn = require("node-fetch");
}
const fetch = fetchFn;

// ---- Extract a Game Pass ID from many formats ----
// Supports:
// - https://www.roblox.com/game-pass/123456/name
// - https://web.roblox.com/game-pass/123456/name
// - https://roblox.com/game-pass/123456
// - game-pass/123456
// - 123456
// - URLs that include ".../game-pass/123456/..."
function extractGamePassId(text) {
  if (!text) return null;
  const s = String(text).trim();

  // plain numeric ID
  if (/^\d+$/.test(s)) return s;

  // common "game-pass/<id>" pattern anywhere in the string
  const m1 = s.match(/game-pass\/(\d+)/i);
  if (m1?.[1]) return m1[1];

  // sometimes users paste like "gamepass 123" or "gp:123"
  const m2 = s.match(/\b(?:gp|gamepass|game-pass)\D*(\d{5,})\b/i);
  if (m2?.[1]) return m2[1];

  return null;
}

// ---- Fetch PH page price by parsing Roblox HTML (best-effort) ----
async function fetchPHPagePrice(gamePassId) {
  try {
    const res = await fetch(`https://www.roblox.com/game-pass/${gamePassId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-PH,en;q=0.9",
        Accept: "text/html",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Try multiple patterns; Roblox changes this sometimes.
    const patterns = [
      /"price"\s*:\s*(\d+)/, // "price":123
      /"PriceInRobux"\s*:\s*(\d+)/, // "PriceInRobux":123
      /data-price\s*=\s*["'](\d+)["']/, // data-price="123"
    ];

    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return parseInt(m[1], 10);
    }

    return null;
  } catch {
    return null;
  }
}

// ---- Fetch product info from Roblox economy API ----
async function fetchGamePassProductInfo(gamePassId) {
  const res = await fetch(
    `https://economy.roblox.com/v1/game-passes/${gamePassId}/game-pass-product-info`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    }
  );

  return res;
}

// ---- Main scanner (shared by /scan and reply-scan) ----
async function runScanFromText(linkOrId) {
  const gamePassId = extractGamePassId(linkOrId);
  if (!gamePassId) {
    return { ok: false, content: "❌ Invalid Roblox game pass link or ID." };
  }

  try {
    const res = await fetchGamePassProductInfo(gamePassId);

    if (!res.ok) {
      // helpful error message
      let reason = `API returned ${res.status}`;
      if (res.status === 403) reason = "Forbidden (403) — Roblox blocked the request.";
      if (res.status === 429) reason = "Rate limited (429) — try again in a bit.";
      if (res.status === 404) reason = "Not found (404) — invalid/deleted gamepass.";

      return {
        ok: false,
        content: `❌ Error fetching game pass info. (${reason})`,
      };
    }

    const data = await res.json();

    const name = data?.Name || "No name";
    const apiPrice = data?.PriceInRobux ?? 0;

    // PH price (best-effort)
    const phPrice = await fetchPHPagePrice(gamePassId);
    const finalPrice = typeof phPrice === "number" ? phPrice : apiPrice;

    const payout = finalPrice > 0 ? Math.floor(finalPrice * 0.7) : 0;
    const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

    const robuxEmoji = process.env.ROBUX_EMOJI_ID
      ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
      : "<:maya_rbx:1479848567479734283>";

    const priceFormatted = Number(finalPrice).toLocaleString();
    const payoutFormatted = Number(payout).toLocaleString();

    const regionalLine =
      phPrice !== null && phPrice !== apiPrice
        ? "⚠️ **Regional pricing POSSIBLY ON **"
        : "✅ **Regional pricing likely OFF **";

    const content =
      ` <${cleanLink}>\n` +
      ` Name: **${name}**\n` +
      ` Price: **${priceFormatted}**\n` +
      ` You will receive: **${payoutFormatted}** ${robuxEmoji}\n` +
      ` ${regionalLine}`;

    return { ok: true, content, gamePassId };
  } catch (err) {
    console.error("Scan internal error:", err);
    return { ok: false, content: "❌ Error fetching game pass info." };
  }
}

// Exported helper: your index.js can call this directly
async function runScan(linkOrId) {
  const result = await runScanFromText(linkOrId);
  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Scan a Roblox game pass")
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("Game pass URL or ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const input = interaction.options.getString("link");
    const result = await runScanFromText(input);

    // Keep your behavior: show errors ephemeral
    if (!result.ok) {
      return interaction.editReply({
        content: result.content,
        ephemeral: true,
      });
    }

    return interaction.editReply({ content: result.content });
  },

  // For index.js reply-scan feature
  runScan,
  extractGamePassId,
};