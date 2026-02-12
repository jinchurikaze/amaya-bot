require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ================= KEEP ALIVE SERVER FOR REPLIT =================
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('✅ Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date() });
});

app.listen(3000, () => {
  console.log('🌐 Server is ready on port 3000');
});
// ================================================================

// Connect to MongoDB
require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ================= LOAD COMMANDS =================
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    }
  }
}

// ================= READY =================
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);

  if (process.env.BOT_STATUS) {
    client.user.setPresence({
      activities: [{ name: process.env.ACTIVITY_NAME || 'amaya' }],
      status: 'online'
    });
  }
});

// ================= SLASH COMMAND HANDLER =================
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    const interactionHandler = require('./interaction');
    return interactionHandler(interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);

    const errorMessage = {
      content: '❌ There was an error executing this command!',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// ================= SCAN FUNCTION =================
async function handleScan(message, gamePassId) {
  try {
    const res = await fetch(
      `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/product-info`
    );

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const data = await res.json();

    const name = data?.Name || "No name";
    const description = data?.Description || "No description";
    const price = data?.PriceInRobux ?? 0;
    const isForSale = data?.IsForSale ?? false;

    const payout = price > 0 ? Math.floor(price * 0.7) : 0;
    const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;


    const robuxEmoji = process.env.ROBUX_EMOJI_ID 
      ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
      : '<:maya_rbx:1470302406813286471>';
    
    const priceFormatted = price.toLocaleString();
    const payoutFormatted = payout.toLocaleString();  

    const reply =
      ` <${cleanLink}>\n` +
      ` Name: **${name}**\n` +
      ` Price: **${priceFormatted}** \n` +
      ` You will receive: **${payoutFormatted}** ${robuxEmoji}\n`;
    
    await message.reply(reply);
   
  } catch (err) {
    console.error('Scan error:', err);
    message.reply("❌ Error fetching game pass info.");
  }
}

// ================= HELPERS =================
function extractGamePassId(text) {
  if (!text) return null;
  const match = text.match(/game-pass\/(\d+)/);
  return match ? match[1] : null;
}

// ================= MESSAGE LISTENER =================
// Prevent duplicate processing
const processedMessages = new Set();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  let gamePassId = null;

  // ===== Reply scan (PRIORITY)
  if (message.content.toLowerCase() === "scan" && message.reference) {
    try {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId
      );

      // Extract ONLY from replied message
      if (replied.content) {
        gamePassId = extractGamePassId(replied.content);
      }

      if (!gamePassId && replied.embeds.length > 0) {
        const embed = replied.embeds[0];
        if (embed.url) {
          gamePassId = extractGamePassId(embed.url);
        }
      }

    } catch (err) {
      console.error("Reply fetch error:", err);
      return;
    }
  }

  // ===== scan <link>
  else if (message.content.toLowerCase().startsWith("scan ")) {
    gamePassId = extractGamePassId(message.content);
  }

  // ===== If nothing found stop here
  if (!gamePassId) return;

  // ===== Prevent duplicates (AFTER valid scan detected)
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  setTimeout(() => processedMessages.delete(message.id), 10000);

  return handleScan(message, gamePassId);
});
// ================= LOGIN =================
client.login(process.env.BOT_TOKEN);