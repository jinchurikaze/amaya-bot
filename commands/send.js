const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('send')
    .setDescription('Sends a custom message')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('The message to send')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    const messageText = interaction.options.getString('message');
    
    // Reply to the interaction first (ephemeral so only user sees it)
    await interaction.reply({ content: '✅ Message sent!', ephemeral: true });
    
    // Send the actual message to the channel
    await interaction.channel.send(messageText);
  },
};