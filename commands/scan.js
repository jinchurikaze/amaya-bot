const { SlashCommandBuilder } = require('discord.js');

async function checkRegionalPricing(gamePassId, price) {
  try {
    // Fetch the game pass page HTML
    const pageRes = await fetch(`https://www.roblox.com/game-pass/${gamePassId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await pageRes.text();

    // Roblox embeds meta price data in the page
    const priceMatch = html.match(/"price"\s*:\s*(\d+)/);
    const pagePrice = priceMatch ? parseInt(priceMatch[1]) : null;

    if (pagePrice !== null && pagePrice !== price) {
      return true; // prices differ = regional pricing active
    }

    return false;
  } catch {
    return false;
  }
}

async function checkRegionalPricingV2(gamePassId) {
  try {
    // Try fetching from the thumbnails/economy endpoint which sometimes exposes regional data
    const res = await fetch(
      `https://economy.roblox.com/v1/game-passes/${gamePassId}/game-pass-product-info`,
      {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'Mozilla/5.0'
        }
      }
    );

    const data = await res.json();

    // If PremiumPriceInRobux exists and differs from PriceInRobux, regional pricing is likely on
    if (data.PremiumPriceInRobux !== undefined && data.PremiumPriceInRobux !== data.PriceInRobux) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Scan a Roblox game pass')
    .addStringOption(option =>
      option
        .setName('link')
        .setDescription('Game pass URL or ID')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const input = interaction.options.getString('link');
    const match = input.match(/game-pass\/(\d+)/) || input.match(/^(\d+)$/);

    if (!match) {
      return interaction.editReply({
        content: '❌ Invalid Roblox game pass link or ID.',
        ephemeral: true
      });
    }

    const gamePassId = match[1];

    try {
      const res = await fetch(
        `https://economy.roblox.com/v1/game-passes/${gamePassId}/game-pass-product-info`
      );

      if (!res.ok) throw new Error(`API returned ${res.status}`);

      const data = await res.json();

      const name = data?.Name || 'No name';
      const price = data?.PriceInRobux ?? 0;
      const payout = price > 0 ? Math.floor(price * 0.7) : 0;
      const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

      const robuxEmoji = process.env.ROBUX_EMOJI_ID
        ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
        : '';

      // Try both detection methods
      const isRegionalV1 = await checkRegionalPricing(gamePassId, price);
      const isRegionalV2 = await checkRegionalPricingV2(gamePassId);
      const isRegional = isRegionalV1 || isRegionalV2;
      console.log('Regional V1:', isRegionalV1, '| Regional V2:', isRegionalV2, '| Price:', price, '| Data:', JSON.stringify(data));

      const regionalWarning = isRegional
        ? '⚠️ **Regional pricing detected**'
        : '✅ No regional pricing detected';

      const content =
        `${cleanLink}\n` +
        `Name: **${name}**\n` +
        `Price: **${price}**\n` +
        `You will receive: **${payout}** ${robuxEmoji}\n` +
        `${regionalWarning}`;

      await interaction.editReply({ content });

    } catch (err) {
      console.error('Scan error:', err);
      await interaction.editReply({
        content: '❌ Error fetching game pass info. Make sure the link/ID is valid.',
        ephemeral: true
      });
    }
  }
};