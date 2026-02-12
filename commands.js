const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js');

const Order = require('../models/order');
const buttons = require('../buttons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Queue an item order')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Item ordered')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('Quantity of the item')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('payment')
        .setDescription('Payment method')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('price')
        .setDescription('Price of the item')
        .setRequired(true)
    ),

  async execute(interaction) {
    const item = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    const payment = interaction.options.getString('payment');
    const price = interaction.options.getInteger('price');

    // Save order in DB
    const order = new Order({
      userId: interaction.user.id,
      username: interaction.user.username,
      item,
      quantity,
      price,
      payment,
      status: 'noted'
    });

    await order.save();

    // Build order embed
    const embed = new EmbedBuilder()
      .setColor('#57f287')
      .setAuthor({
        name: '🐱 order confirmed',
        iconURL: 'https://i.imgur.com/7bIYpKp.png'
      })
      .setDescription(
        `— **#${interaction.user.username}**\n` +
        `— **${quantity}** · ${item}\n` +
        `— **₱${price}** · paid thru **${payment}** !\n\n` +
        `status ／ **${order.status}**`
      )
      .setFooter({ text: `Order ID: ${order._id}` })
      .setTimestamp();

    // Send embed to order list channel
    const orderListChannel = interaction.guild.channels.cache.get(
      process.env.ORDERLIST_CHANNEL_ID
    );

    await orderListChannel.send({
      embeds: [embed],
      components: [buttons]
    });

    // Public reply in the command channel
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Order List')
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${interaction.guild.id}/${orderListChannel.id}`
        )
    );

    await interaction.reply({
      content: `📦 **${interaction.user.username}** added an order to the queue!`,
      components: [row]
    });
  }
};
