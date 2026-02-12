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

    const embed = new EmbedBuilder()
      .setColor(order.status === "done" ? "#57f287" : "#faa61a")
      .setAuthor({ name: "order confirmed", iconURL: "https://i.imgur.com/7bIYpKp.png" })
      .setDescription(
        `— **#${order.username}**\n` +
        `— **${order.quantity}** · ${order.item}\n` +
        `— **₱${order.price}** · paid thru **${order.payment}** !\n\n` +
        `status ／ **${order.status}**`
      )
      .setFooter({ text: `Order ID: ${order._id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
