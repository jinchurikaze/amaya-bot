// index.js
// UPDATED VERSION - FIXED (removed duplicates)
// ✅ uses BOT_TOKEN from environment variables
// ✅ Express server for keeping bot awake
// ✅ scan features
// ✅ sticky message support

require("dotenv").config();

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const express = require("express");

// ================= KEEP ALIVE SERVER =================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.get("/health", (req, res) =>
  res.json({ status: "alive", timestamp: new Date() })
);

app.listen(PORT, () => console.log(`🌐 Server is ready on port ${PORT}`));

// ================= DATABASE =================
// require("./database"); // MongoDB disabled - not needed

// ================= STICKY STORAGE =================
const { loadStickyData, saveStickyData } = require("./stickyData");

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ================= LOAD COMMANDS =================
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
    }
  }
}

// ================= READY =================
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);

  if (process.env.BOT_STATUS) {
    client.user.setPresence({
      activities: [{ name: process.env.ACTIVITY_NAME || "amaya" }],
      status: "online",
    });
  }
});

// ================= SLASH COMMAND + BUTTON HANDLER =================
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    const interactionHandler = require("./interaction");
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
    console.error("Slash command error:", error);

    const errorMessage = {
      content: "❌ There was an error executing this command!",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage).catch(() => {});
    } else {
      await interaction.reply(errorMessage).catch(() => {});
    }
  }
});

// ================= SCAN HELPERS =================
let scanCommand = null;
try {
  scanCommand = require("./commands/scan");
} catch (err) {
  console.error("❌ Failed to load ./commands/scan.js:", err);
}

function extractGamePassId(text) {
  if (scanCommand && typeof scanCommand.extractGamePassId === "function") {
    return scanCommand.extractGamePassId(text);
  }

  // fallback only if scan.js failed to load
  if (!text) return null;
  const s = String(text).trim();

  if (/^\d+$/.test(s)) return s;

  const patterns = [
    /game-pass\/(\d+)/i,
    /gamepass\/(\d+)/i,
    /game-passes\/(\d+)/i,
    /\/passes\/(\d+)/i,
    /\b(?:gp|gamepass|game-pass)\D*(\d{5,})\b/i,
    /id=(\d+)/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }

  return null;
}

async function handleScan(message, input) {
  try {
    if (!scanCommand || typeof scanCommand.runScan !== "function") {
      return message.reply("❌ Scan command is not available right now.");
    }

    const result = await scanCommand.runScan(input);

    if (!result?.ok) {
      return message.reply(result?.content || "❌ Error fetching game pass info.");
    }

    return message.reply(result.content);
  } catch (err) {
    console.error("Scan error:", err);
    return message.reply("❌ Error fetching game pass info.");
  }
}

// ================= MESSAGE LISTENER =================
const processedMessages = new Set();
const stickyCooldowns = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // =========================
  // SCAN FEATURE
  // =========================
  let scanInput = null;

  if (message.content.toLowerCase() === "scan" && message.reference) {
    try {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId
      );

      if (replied.content) {
        scanInput = replied.content;
      }

      if (!scanInput && replied.embeds?.length > 0) {
        const embed = replied.embeds[0];

        if (embed.url) scanInput = embed.url;
        if (!scanInput && embed.description) scanInput = embed.description;
        if (!scanInput && embed.title) scanInput = embed.title;
      }
    } catch (err) {
      console.error("Reply fetch error:", err);
      return;
    }
  } else if (message.content.toLowerCase().startsWith("scan ")) {
    scanInput = message.content.slice(5).trim();
  }

  if (scanInput) {
    const gamePassId = extractGamePassId(scanInput);

    if (!gamePassId) {
      return message.reply("❌ Invalid Roblox game pass link or ID.");
    }

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 10000);

    return handleScan(message, gamePassId);
  }

  // =========================
  // STICKY FEATURE
  // =========================
  const stickyData = loadStickyData();
  const sticky = stickyData[message.channel.id];

  if (!sticky) return;

  // ignore the sticky message itself so it doesn't loop
  if (message.id === sticky.messageId) return;

  // cooldown to reduce spam in active channels
  const now = Date.now();
  const lastStickyTime = stickyCooldowns.get(message.channel.id) || 0;

  if (now - lastStickyTime < 3000) return;
  stickyCooldowns.set(message.channel.id, now);

  try {
    // delete previous sticky
    if (sticky.messageId) {
      try {
        const oldSticky = await message.channel.messages.fetch(sticky.messageId);
        await oldSticky.delete().catch(() => {});
      } catch (err) {
        // previous sticky may already be deleted or missing
      }
    }

    // send new sticky at bottom
    const newSticky = await message.channel.send({
      content: sticky.content
    });

    stickyData[message.channel.id].messageId = newSticky.id;
    saveStickyData(stickyData);
  } catch (error) {
    console.error("Sticky message error:", error);
  }
});

// ================= LOGIN =================
const token = process.env.BOT_TOKEN;

console.log("TEST_VAR:", process.env.TEST_VAR);
console.log(
  "All env keys sample:",
  Object.keys(process.env).filter((k) =>
    ["BOT_TOKEN", "TEST_VAR", "MONGO_URI", "CLIENT_ID", "GUILD_ID"].includes(k)
  )
);
console.log("BOT_TOKEN exists:", token !== undefined);
console.log("BOT_TOKEN type:", typeof token);
console.log("BOT_TOKEN length:", token ? token.length : 0);

if (!token) {
  console.error("Missing BOT_TOKEN in environment variables.");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("Login failed:", err.message);
});