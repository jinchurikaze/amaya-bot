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
    /game-pass\/(\d+)/i,
    /gamepass\/(\d+)/i,
    /game-passes\/(\d+)/i,
    /\/passes\/(\d+)/i,
    /\b(?:gp|gamepass|game-pass)\D*(\d{5,})\b/i,
    /id=(\d+)/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

// --------------------------------------------------
// OLD WORKING PRODUCT INFO ENDPOINT
// --------------------------------------------------
async function fetchGamePassProductInfo(gamePassId) {
  return fetch(
    `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/product-info`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    }
  );
}

// --------------------------------------------------
// Regional pricing details
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
// Detect regional pricing
// --------------------------------------------------
function detectRegionalPricing(detailsData) {
  if (!detailsData || typeof detailsData !== "object") {
    return {
      status: "UNKNOWN",
      reason: "No details data available.",
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
      reason: "Regional pricing indicators detected.",
    };
  }

  return {
    status: "OFF",
    reason: "No regional pricing indicators found.",
  };
}

// --------------------------------------------------
// Clean output format
// --------------------------------------------------
function formatScanMessage({
  cleanLink,
  listedPrice,
  payout,
  regional,
}) {
  const robuxEmoji = process.env.ROBUX_EMOJI_ID
    ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
    : "<:maya_rbx:1479848567479734283>";

  const priceFormatted = Number(listedPrice).toLocaleString();
  const payoutFormatted = Number(payout).toLocaleString();

  let regionalLine = "❔ Regional pricing: Unknown";
  if (regional.status === "ON") {
    regionalLine = "⚠️ Regional pricing: ON";
  } else if (regional.status === "OFF") {
    regionalLine = null;
  }

  return [
    `1. ${cleanLink}`,
    ``,
    `Price: ${priceFormatted}`,
    `You will receive: **${payoutFormatted}** ${robuxEmoji}`,
    `${regionalLine}`,
  ].join("\n");
}

// --------------------------------------------------
// Main scanner
// --------------------------------------------------
async function runScanFromText(linkOrId) {
  const gamePassId = extractGamePassId(linkOrId);

  if (!gamePassId) {
    return { ok: false, content: "❌ Invalid Roblox game pass link or ID." };
  }

  try {
    const productRes = await fetchGamePassProductInfo(gamePassId);

    if (!productRes.ok) {
      let reason = `API returned ${productRes.status}`;
      if (productRes.status === 403) {
        reason = "Forbidden (403) — Roblox blocked the request.";
      }
      if (productRes.status === 404) {
        reason = "Not found (404) — invalid/deleted gamepass.";
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

    const listedPrice = Number(
      productData?.PriceInRobux ??
      productData?.priceInRobux ??
      productData?.price ??
      0
    );

    const payout = listedPrice > 0 ? Math.floor(listedPrice * 0.7) : 0;
    const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

    const detailsResult = await fetchGamePassDetails(gamePassId);

    let regional;
    if (detailsResult.ok) {
      regional = detectRegionalPricing(detailsResult.data);
    } else {
      regional = {
        status: "UNKNOWN",
        reason: "Could not verify regional pricing.",
      };
    }

    const content = formatScanMessage({
      cleanLink,
      listedPrice,
      payout,
      regional,
    });

    return { ok: true, content, gamePassId, regional };
  } catch (err) {
    console.error("Scan internal error:", err);
    return { ok: false, content: "❌ Error fetching game pass info." };
  }
}

// --------------------------------------------------
// Exported helper
// --------------------------------------------------
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