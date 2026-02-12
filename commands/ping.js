const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong and latency information!'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const pingtime = sent.createdTimestamp - interaction.createdTimestamp;
       
        await interaction.editReply(`Pong! Latency is ${pingtime}ms.\ms API Latency is ${Math.round(interaction.client.ws.ping)}ms.`);

    }   };