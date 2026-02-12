const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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

    // Extract game pass ID from URL or use direct ID
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
        `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/product-info`
      );

      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }

      const data = await res.json();

      // Get game pass details
      const name = data?.Name || "No name";
      const description = data?.Description || "No description";
      const price = data?.PriceInRobux ?? 0;
      const isForSale = data?.IsForSale ?? false;

      // Calculate payout (70% after 30% tax)
      const payout = price > 0 ? Math.floor(price * 0.7) : 0;

      const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

      // Get Robux emoji or use default
      const robuxEmoji = process.env.ROBUX_EMOJI_ID 
        ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
        : ':maya_rbx:1470302406813286471>';

      // Create embed matching the screenshot style
      const embed = new EmbedBuilder()
        .setTitle(`${payout} - Robux`)
        .setURL(cleanLink)
        .setDescription('Roblox is a global platform that brings people together through play.')
        .setColor('#0066CC')
        .setFooter({ text: `Game Pass ID: ${gamePassId}` });

      // Format the message content
      const content =
        `1. ${cleanLink}\n` +
        `Price: **${price}**\n` +
        `You will receive: **${payout}** ${robuxEmoji}`;

      await interaction.editReply({
        content: content,
        embeds: [embed]
      });

    } catch (err) {
      console.error('Scan error:', err);
      await interaction.editReply({
        content: '❌ Error fetching game pass info. Make sure the link/ID is valid.',
        ephemeral: true
      });
    }
  }
};