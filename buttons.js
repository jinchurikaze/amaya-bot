const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("order_done")
    .setLabel("Done")
    .setStyle(ButtonStyle.Success),

  new ButtonBuilder()
    .setCustomId("order_cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
);