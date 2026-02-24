const Order = require("./models/order");

module.exports = async (interaction) => {
  if (!interaction.isButton()) return;

  const footer = interaction.message.embeds[0]?.footer?.text;
  if (!footer) return;

  const orderId = footer.split(": ")[1];
  const order = await Order.findById(orderId);
  if (!order) {
    return interaction.reply({
      content: '❌ Order not found in database.',
      ephemeral: true
    });
  }

  if (interaction.customId === "order_done") {
    order.status = "done";
  } else if (interaction.customId === "order_cancel") {
    order.status = "cancelled";
  }

  await order.save();

  const updatedEmbed = interaction.message.embeds[0].setDescription(
    interaction.message.embeds[0].description.replace(
      /status ː \*\*.*\*\*/,
      `status ː **${order.status}**`
    )
  );

  await interaction.update({
    embeds: [updatedEmbed],
    components: []
  });
};