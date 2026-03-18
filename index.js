// index.js
// CLEANED + DEBUG VERSION
// ✅ uses BOT_TOKEN from environment variables
// ✅ Express server for Render
// ✅ scan features
// ✅ sticky message support
// ✅ improved Discord login/error debugging
// ✅ no manual token REST test
// ✅ no duplicate login

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const express = require("express");

// ================= KEEP ALIVE SERVER =================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.get("/health", (req, res) =>
  res.json({ status: "alive", timestamp: new Date().toISOString() })
);

app.listen(PORT, () => console.log(`🌐 Server is ready on port ${PORT}`));

// ================= DATABASE =================
// require("./database"); // MongoDB disabled - not needed

// ================= STICKY STORAGE =================
const { loadStickyData, saveStickyData } = require("./stickyData");

// ================= OPTIONAL HANDLERS =================
let interactionHandler = null;
try {
  interactionHandler = require("./interaction");
} catch (err) {
  console.warn("⚠️ interaction.js not loaded:", err.message);
}

let scanCommand = null;
try {
  scanCommand = require("./commands/scan");
} catch (err) {
  console.error("❌ Failed to load ./commands/scan.js:", err);
}

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// ================= PROCESS ERROR HANDLERS =================
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught exception:", error);
});

process.on("uncaughtExceptionMonitor", (error) => {
  console.error("❌ Uncaught exception monitor:", error);
});

// ================= LOAD COMMANDS =================
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);

      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠️ Skipped invalid command file: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Failed to load command file ${file}:`, err);
    }
  }
} else {
  console.warn("⚠️ commands folder not found.");
}

// ================= READY =================
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ Logged in as ${readyClient.user.tag}`);
  console.log(`🆔 Bot user ID: ${readyClient.user.id}`);
  console.log(`📊 Serving ${readyClient.guilds.cache.size} server(s)`);

  try {
    const activityName = process.env.ACTIVITY_NAME || "amaya";
    const activityTypeRaw = (process.env.BOT_ACTIVITY || "PLAYING").toUpperCase();

    const activityMap = {
      PLAYING: ActivityType.Playing,
      WATCHING: ActivityType.Watching,
      LISTENING: ActivityType.Listening,
      COMPETING: ActivityType.Competing,
      STREAMING: ActivityType.Streaming,
    };

    const activityType = activityMap[activityTypeRaw] ?? ActivityType.Playing;

    await readyClient.user.setPresence({
      activities: [{ name: activityName, type: activityType }],
      status: "online",
    });

    console.log(
      `✅ Presence set: ${activityTypeRaw} ${activityName} | status=online`
    );
  } catch (err) {
    console.error("❌ Failed to set presence:", err);
  }
});

// ================= DISCORD DEBUG EVENTS =================
client.on(Events.Error, (error) => {
  console.error("❌ Discord client error:", error);
});

client.on(Events.Warn, (info) => {
  console.warn("⚠️ Discord warning:", info);
});

client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`⚠️ Shard ${shardId} disconnected. Code: ${event.code}`);
});

client.on(Events.ShardError, (error, shardId) => {
  console.error(`❌ Shard ${shardId} error:`, error);
});

client.on(Events.ShardReady, (shardId) => {
  console.log(`✅ Shard ${shardId} is ready`);
});

client.on(Events.ShardResume, (shardId, replayedEvents) => {
  console.log(`🔄 Shard ${shardId} resumed, replayed ${replayedEvents} events`);
});

client.on("debug", (msg) => {
  if (
    msg.includes("Hit a 429") ||
    msg.includes("Provided token") ||
    msg.includes("Identifying") ||
    msg.includes("Session Limit Information") ||
    msg.includes("Preparing to connect")
  ) {
    console.log("🔎 DEBUG:", msg);
  }
});

// ================= SLASH COMMAND + BUTTON HANDLER =================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (!interactionHandler) {
        return interaction
          .reply({
            content: "❌ Interaction handler is unavailable.",
            ephemeral: true,
          })
          .catch(() => {});
      }

      return interactionHandler(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`❌ No command matching ${interaction.commandName}`);
      return interaction
        .reply({
          content: "❌ Command not found.",
          ephemeral: true,
        })
        .catch(() => {});
    }

    await command.execute(interaction);
  } catch (error) {
    console.error("❌ Interaction error:", error);

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
function extractGamePassId(text) {
  if (scanCommand && typeof scanCommand.extractGamePassId === "function") {
    return scanCommand.extractGamePassId(text);
  }

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
    console.error("❌ Scan error:", err);
    return message.reply("❌ Error fetching game pass info.");
  }
}

// ================= MESSAGE LISTENER =================
const processedMessages = new Set();
const stickyCooldowns = new Map();

client.on(Events.MessageCreate, async (message) => {
  try {
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
        console.error("❌ Reply fetch error:", err);
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
    if (message.id === sticky.messageId) return;

    const now = Date.now();
    const lastStickyTime = stickyCooldowns.get(message.channel.id) || 0;

    if (now - lastStickyTime < 3000) return;
    stickyCooldowns.set(message.channel.id, now);

    try {
      if (sticky.messageId) {
        try {
          const oldSticky = await message.channel.messages.fetch(sticky.messageId);
          await oldSticky.delete().catch(() => {});
        } catch {
          // ignore if old sticky is already missing
        }
      }

      const newSticky = await message.channel.send({
        content: sticky.content,
      });

      stickyData[message.channel.id].messageId = newSticky.id;
      saveStickyData(stickyData);
    } catch (error) {
      console.error("❌ Sticky message error:", error);
    }
  } catch (err) {
    console.error("❌ messageCreate handler crashed:", err);
  }
});

// ================= LOGIN =================
const token = process.env.BOT_TOKEN;

console.log("🔐 BOT_TOKEN exists:", !!token);
console.log("🔐 BOT_TOKEN length:", token ? token.length : 0);

if (!token) {
  console.error("❌ Missing BOT_TOKEN in environment variables.");
  process.exit(1);
}

(async () => {
  try {
    console.log("🔄 Attempting to login to Discord...");
    await client.login(token);
    console.log("✅ client.login() resolved successfully");
  } catch (err) {
    console.error("❌ LOGIN FAILED");
    console.error("Message:", err.message);
    console.error("Code:", err.code);
    console.error("Full error:", err);
    process.exit(1);
  }
})();