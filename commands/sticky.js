const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");

const { loadStickyData, saveStickyData } = require("../stickyData");

async function deleteOldSticky(channel, messageId) {
  if (!channel || !messageId) return;

  try {
    const oldSticky = await channel.messages.fetch(messageId);
    await oldSticky.delete().catch(() => {});
  } catch {
    // Ignore missing/deleted sticky messages
  }
}

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
    const channel = interaction.channel;
    const channelId = channel.id;

    const stickyData = loadStickyData();
    const currentSticky = stickyData[channelId];

    if (subcommand === "set") {
      const content = interaction.options.getString("message");

      await deleteOldSticky(channel, currentSticky?.messageId);

      const sent = await channel.send({
        content,
        allowedMentions: {
          parse: [],
        },
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
      if (!currentSticky) {
        return interaction.reply({
          content: "There is no sticky message set in this channel.",
          ephemeral: true,
        });
      }

      return interaction.reply({
        content: `📌 Current sticky message:\n${currentSticky.content}`,
        ephemeral: true,
        allowedMentions: {
          parse: [],
        },
      });
    }

    if (subcommand === "remove") {
      if (!currentSticky) {
        return interaction.reply({
          content: "There is no sticky message set in this channel.",
          ephemeral: true,
        });
      }

      await deleteOldSticky(channel, currentSticky.messageId);

      delete stickyData[channelId];
      saveStickyData(stickyData);

      return interaction.reply({
        content: "🗑️ Sticky message removed from this channel.",
        ephemeral: true,
      });
    }
  },
};