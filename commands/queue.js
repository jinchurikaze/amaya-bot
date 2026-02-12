const {
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Add an order to the queue')
    .addStringOption(option =>
      option.setName('item')
        .setDescription('Item ordered')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Quantity')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('payment')
        .setDescription('Payment method')
        .setRequired(true)
        .addChoices(
          { name: 'gcash', value: 'gcash' },
          { name: 'maya', value: 'maya' },
          { name: 'bank transfer', value: 'bank transfer' },
          { name: 'paypal', value: 'paypal' }
        ))
    .addStringOption(option =>
      option.setName('price')
        .setDescription('Price')
        .setRequired(true)),

  async execute(interaction) {

    await interaction.deferReply();

    const item = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
    const payment = interaction.options.getString('payment');
    const price = interaction.options.getString('price');

    const orderListChannel =
      interaction.guild.channels.cache.get('1056513740956254258');

    if (!orderListChannel) {
      return interaction.editReply({
        content: "⚠️ Couldn't find the orderlist channel."
      });
    }

    // send order message
    const orderMessage = await orderListChannel.send({
      content: `⠀
<:maya_24:1378327229926215681>   **order confirmed**
<:maya_11:1378085579463589959>  https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}
<:maya_11:1378085579463589959>  ${quantity}  •  ${item}
<:maya_11:1378085579463589959>  ₱${price}  •  thru ${payment}
⠀`
    });

    // view message button
    const viewButton = new ButtonBuilder()
      .setLabel('View Message')
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://discord.com/channels/${interaction.guild.id}/${orderListChannel.id}/${orderMessage.id}`
      );

    const row = new ActionRowBuilder().addComponents(viewButton);

    // confirmation reply
    await interaction.editReply({
      content: " Your order has been listed.",
      components: [row]
    });

  }
};
