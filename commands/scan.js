// commands/scan.js
const { SlashCommandBuilder } = require("discord.js");

// ---- fetch compatibility ----
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  fetchFn = require("node-fetch");
}
const fetch = fetchFn;

// --------------------------------------------------
// Extract Game Pass ID
// --------------------------------------------------
function extractGamePassId(text) {
  if (!text) return null;
  const s = String(text).trim();

  if (/^\d+$/.test(s)) return s;

  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?roblox\.com\/game-pass\/(\d+)/i,
    /(?:https?:\/\/)?web\.roblox\.com\/game-pass\/(\d+)/i,
    /game-pass\/(\d+)/i,
    /gamepass\/(\d+)/i,
    /game-passes\/(\d+)/i,
    /\/passes\/(\d+)/i,
    /\b(?:gp|gamepass|game-pass)\D*(\d{5,})\b/i,
    /id=(\d+)/i,
    /\b(\d{5,})\b/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

// --------------------------------------------------
// Product info
// --------------------------------------------------
async function fetchGamePassProductInfo(gamePassId) {
  return fetch(
    `https://economy.roblox.com/v1/game-passes/${gamePassId}/game-pass-product-info`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    }
  );
}

// --------------------------------------------------
// Better regional-pricing signal
// Best-effort only
// --------------------------------------------------
async function fetchGamePassDetails(gamePassId) {
  const urls = [
    `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/details`,
    `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/details?universeId=0`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      lastError = err.message;
    }
  }

  return { ok: false, error: lastError || "Unknown error" };
}

// --------------------------------------------------
// Optional page scrape: informational only
// --------------------------------------------------
async function fetchPagePrice(gamePassId, acceptLanguage = "en-US,en;q=0.9") {
  try {
    const res = await fetch(`https://www.roblox.com/game-pass/${gamePassId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": acceptLanguage,
        Accept: "text/html",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    const patterns = [
      /"price"\s*:\s*(\d+)/i,
      /"PriceInRobux"\s*:\s*(\d+)/i,
      /data-price\s*=\s*["'](\d+)["']/i,
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

// --------------------------------------------------
// Decide regional pricing from details endpoint
// --------------------------------------------------
function detectRegionalPricing(detailsData) {
  if (!detailsData || typeof detailsData !== "object") {
    return {
      status: "UNKNOWN",
      reason: "No details data available.",
      features: [],
      experimentActive: null,
    };
  }

  const priceInfo =
    detailsData.priceInformation ||
    detailsData.priceInfo ||
    detailsData;

  const enabledFeatures = Array.isArray(priceInfo.enabledFeatures)
    ? priceInfo.enabledFeatures
    : [];

  const experimentActive =
    priceInfo.isInActivePriceOptimizationExperiment === true;

  const hasRegionalFeature = enabledFeatures.some((feature) =>
    [
      "RegionalPriceExperiment",
      "RegionalPricing",
      "ManagedPricing",
    ].includes(String(feature))
  );

  if (hasRegionalFeature || experimentActive) {
    return {
      status: "ON",
      reason: hasRegionalFeature
        ? `Detected flag: ${enabledFeatures.join(", ")}`
        : "Price optimization experiment is active.",
      features: enabledFeatures,
      experimentActive,
    };
  }

  return {
    status: "OFF",
    reason: "No regional-pricing indicators were found.",
    features: enabledFeatures,
    experimentActive,
  };
}

// --------------------------------------------------
// Build result text
// --------------------------------------------------
function formatScanMessage({
  cleanLink,
  listedPrice,
  payout,
  regional,
}) {
  const robuxEmoji = process.env.ROBUX_EMOJI_ID
    ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
    : "🪙";

  const priceFormatted = Number(listedPrice).toLocaleString();
  const payoutFormatted = Number(payout).toLocaleString();

  let regionalLine = "❔ **Regional Pricing:** Unknown";
  if (regional.status === "ON") {
    regionalLine = "⚠️ **Regional Pricing:** ON";
  } else if (regional.status === "OFF") {
    regionalLine = "✅ **Regional Pricing:** OFF";
  }

  return [
    `1. ${cleanLink}`,
    ``,
    `**Price:** ${priceFormatted}`,
    `**You will receive:** ${payoutFormatted} ${robuxEmoji}`,
    `${regionalLine}`,
  ].join("\n");
}

// --------------------------------------------------
// Main scanner
// --------------------------------------------------
async function runScanFromText(linkOrId) {
  const gamePassId = extractGamePassId(linkOrId);

  console.log("----- SCAN DEBUG START -----");
  console.log("[SCAN] raw input:", linkOrId);
  console.log("[SCAN] extracted gamePassId:", gamePassId);
  console.log("----- SCAN DEBUG END -------");

  if (!gamePassId) {
    return { ok: false, content: "❌ Invalid Roblox game pass link or ID." };
  }

  try {
    const productRes = await fetchGamePassProductInfo(gamePassId);

    console.log(
      `[SCAN] product-info status for ${gamePassId}:`,
      productRes.status
    );

    if (!productRes.ok) {
      let reason = `API returned ${productRes.status}`;
      if (productRes.status === 403) {
        reason = "Forbidden (403) — Roblox blocked the request.";
      }
      if (productRes.status === 404) {
        reason =
          "Not found (404) — invalid ID, unavailable pass, or Roblox did not return this gamepass.";
      }
      if (productRes.status === 429) {
        reason = "Rate limited (429) — try again later.";
      }

      return {
        ok: false,
        content: `❌ Error fetching game pass info. (${reason})`,
      };
    }

    const productData = await productRes.json();
    console.log("[SCAN] productData:", productData);

    const listedPrice = Number(
      productData?.PriceInRobux ?? productData?.priceInRobux ?? 0
    );
    const payout = listedPrice > 0 ? Math.floor(listedPrice * 0.7) : 0;
    const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

    const detailsResult = await fetchGamePassDetails(gamePassId);

    let regional;
    if (detailsResult.ok) {
      console.log("[SCAN] detailsData:", detailsResult.data);
      regional = detectRegionalPricing(detailsResult.data);
    } else {
      console.log("[SCAN] details fetch failed:", detailsResult.error);
      regional = {
        status: "UNKNOWN",
        reason: `Could not verify from details endpoint (${detailsResult.error}).`,
        features: [],
        experimentActive: null,
      };
    }

    const [pagePriceUS, pagePricePH] = await Promise.all([
      fetchPagePrice(gamePassId, "en-US,en;q=0.9"),
      fetchPagePrice(gamePassId, "en-PH,en;q=0.9"),
    ]);

    console.log("[SCAN] pagePriceUS:", pagePriceUS);
    console.log("[SCAN] pagePricePH:", pagePricePH);
    console.log("[SCAN] regional result:", regional);

    const content = formatScanMessage({
      cleanLink,
      listedPrice,
      payout,
      regional,
    });

    return {
      ok: true,
      content,
      gamePassId,
      regional,
      pagePriceUS,
      pagePricePH,
    };
  } catch (err) {
    console.error("Scan internal error:", err);
    return { ok: false, content: "❌ Error fetching game pass info." };
  }
}

// Exported helper
async function runScan(linkOrId) {
  return runScanFromText(linkOrId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Scan a Roblox game pass and check regional pricing")
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

    return interaction.editReply({
      content: result.content,
    });
  },

  runScan,
  extractGamePassId,
};