const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const { loadStickyData, saveStickyData } = require("../stickyData");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Manage sticky messages in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set a sticky message for this channel")
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("The sticky message content")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View the current sticky message in this channel")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove the sticky message from this channel")
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channel.id;
    const stickyData = loadStickyData();

    if (subcommand === "set") {
      const content = interaction.options.getString("message");

      if (stickyData[channelId]?.messageId) {
        try {
          const oldSticky = await interaction.channel.messages.fetch(
            stickyData[channelId].messageId
          );
          await oldSticky.delete().catch(() => {});
        } catch {}
      }

      const sent = await interaction.channel.send({
        content: content
      });

      stickyData[channelId] = {
        content,
        messageId: sent.id,
      };

      saveStickyData(stickyData);

      return interaction.reply({
        content: "✅ Sticky message set for this channel.",
        ephemeral: true,
      });
    }

    if (subcommand === "view") {
      if (!stickyData[channelId]) {
        return interaction.reply({
          content: "There is no sticky message set in this channel.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `📌 Current sticky message:\n${stickyData[channelId].content}`,
        ephemeral: true,
      });
    }

    if (subcommand === "remove") {
      if (!stickyData[channelId]) {
        return interaction.reply({
          content: "There is no sticky message set in this channel.",
          ephemeral: true,
        });
      }

      if (stickyData[channelId]?.messageId) {
        try {
          const oldSticky = await interaction.channel.messages.fetch(
            stickyData[channelId].messageId
          );
          await oldSticky.delete().catch(() => {});
        } catch {}
      }

      delete stickyData[channelId];
      saveStickyData(stickyData);

      return interaction.reply({
        content: "🗑️ Sticky message removed from this channel.",
        ephemeral: true,
      });
    }
  },
};