const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send an order confirmation embed'),

  async execute(interaction) {

    const order = {
      username: interaction.user.username,
      quantity: 1,
      item: 'Sample Item',
      price: 100,
      payment: 'GCash',
      status: 'done',
      _id: '12345'
    };

    const statusEmoji =
      order.status === "done"
        ? "🟢"
        : "🟠";

    const embed = new EmbedBuilder()
      .setColor('#2B2D31')

      .setAuthor({
        name: 'order confirmed',
        iconURL: 'https://i.imgur.com/7bIYpKp.png'
      })

      .setThumbnail(interaction.user.displayAvatarURL())

      .setDescription(
        [
          `### ${order.username}`,
          ``,
          `> 📦 item : **${order.item}**`,
          `> 🔢 quantity : **${order.quantity}**`,
          `> 💸 price : **₱${order.price}**`,
          `> 💳 payment : **${order.payment}**`,
          ``,
          `> ${statusEmoji} status : **${order.status}**`
        ].join('\n')
      )

      .setFooter({
        text: `Order ID • ${order._id}`
      })

      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
};