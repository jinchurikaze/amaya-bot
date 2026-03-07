// index.js (UPDATED SAFE VERSION)
// ✅ uses BOT_TOKEN from environment variables
// ✅ logs token debug info
// ✅ only logs in once
// ✅ keeps your scan features

require("dotenv").config();

const { Client, GatewayIntentBits, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const express = require("express");

// ================= KEEP ALIVE SERVER =================
const app = express();

app.get("/", (req, res) => res.send("✅ Bot is running!"));
app.get("/health", (req, res) =>
  res.json({ status: "alive", timestamp: new Date() })
);

app.listen(3000, () => console.log("🌐 Server is ready on port 3000"));
// =====================================================

// Connect to MongoDB
require("./database");

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
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
client.once("clientReady", () => {
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
    console.error(error);

    const errorMessage = {
      content: "❌ There was an error executing this command!",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// ================= SCAN HELPERS =================

// Extract a Game Pass ID from many formats
function extractGamePassId(text) {
  if (!text) return null;
  const s = String(text).trim();

  if (/^\d+$/.test(s)) return s;

  const m1 = s.match(/game-pass\/(\d+)/i);
  if (m1?.[1]) return m1[1];

  const m2 = s.match(/\b(?:gp|gamepass|game-pass)\D*(\d{5,})\b/i);
  if (m2?.[1]) return m2[1];

  return null;
}

// PH page price parsing (best-effort)
async function fetchPHPagePrice(gamePassId) {
  try {
    const res = await fetch(`https://www.roblox.com/game-pass/${gamePassId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-PH,en;q=0.9",
        Accept: "text/html",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    const patterns = [
      /"price"\s*:\s*(\d+)/,
      /"PriceInRobux"\s*:\s*(\d+)/,
      /data-price\s*=\s*["'](\d+)["']/,
    ];

    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return parseInt(m[1], 10);
    }

    return null;
  } catch {
    return null;
  }
}

async function handleScan(message, gamePassId) {
  try {
    const res = await fetch(
      `https://apis.roblox.com/game-passes/v1/game-passes/${gamePassId}/product-info`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      let reason = `Roblox API returned ${res.status}`;
      if (res.status === 403) reason = "Forbidden (403) — blocked by Roblox.";
      if (res.status === 429) reason = "Rate limited (429) — try again later.";
      if (res.status === 404) {
        reason = "Not found (404) — invalid/deleted/private pass.";
      }

      console.log("[SCAN] gamePassId:", gamePassId, "| status:", res.status);
      return message.reply(`❌ Error fetching game pass info. (${reason})`);
    }

    const data = await res.json();

    const name = data?.Name || data?.name || "No name";
    const apiPrice = data?.PriceInRobux ?? data?.priceInRobux ?? 0;

    const phPrice = await fetchPHPagePrice(gamePassId);
    const finalPrice = typeof phPrice === "number" ? phPrice : apiPrice;

    const payout = finalPrice > 0 ? Math.floor(finalPrice * 0.7) : 0;
    const cleanLink = `https://www.roblox.com/game-pass/${gamePassId}`;

    const robuxEmoji = process.env.ROBUX_EMOJI_ID
      ? `<:robux:${process.env.ROBUX_EMOJI_ID}>`
      : "<:maya_rbx:1470302406813286471>";

    const priceFormatted = Number(finalPrice).toLocaleString();
    const payoutFormatted = Number(payout).toLocaleString();

    const regionalLine =
      phPrice !== null && phPrice !== apiPrice
        ? "⚠️ **Regional pricing POSSIBLY ON (PH price differs)**"
        : "✅ **Regional pricing likely OFF (PH matches base price)**";

    const reply =
      ` <${cleanLink}>\n` +
      ` Name: **${name}**\n` +
      ` Price: **${priceFormatted}**\n` +
      ` You will receive: **${payoutFormatted}** ${robuxEmoji}\n` +
      ` ${regionalLine}`;

    await message.reply(reply);
  } catch (err) {
    console.error("Scan error:", err);
    message.reply("❌ Error fetching game pass info.");
  }
}

// ================= MESSAGE LISTENER =================
const processedMessages = new Set();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  let gamePassId = null;

  if (message.content.toLowerCase() === "scan" && message.reference) {
    try {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId
      );

      if (replied.content) {
        gamePassId = extractGamePassId(replied.content);
      }

      if (!gamePassId && replied.embeds?.length > 0) {
        const embed = replied.embeds[0];
        if (embed.url) gamePassId = extractGamePassId(embed.url);
        if (!gamePassId && embed.description) {
          gamePassId = extractGamePassId(embed.description);
        }
        if (!gamePassId && embed.title) {
          gamePassId = extractGamePassId(embed.title);
        }
      }
    } catch (err) {
      console.error("Reply fetch error:", err);
      return;
    }
  } else if (message.content.toLowerCase().startsWith("scan ")) {
    gamePassId = extractGamePassId(message.content);
  }

  if (!gamePassId) return;

  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  setTimeout(() => processedMessages.delete(message.id), 10000);

  return handleScan(message, gamePassId);
});

// ================= LOGIN =================
const token = process.env.BOT_TOKEN;
console.log("TEST_VAR:", process.env.TEST_VAR);
console.log("All env keys sample:", Object.keys(process.env).filter(k =>
  ["BOT_TOKEN", "TEST_VAR", "MONGO_URI", "CLIENT_ID", "GUILD_ID"].includes(k)
));
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