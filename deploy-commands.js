require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// Validate environment variables
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing in .env file!');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error('❌ CLIENT_ID is missing in .env file!');
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.error('❌ GUILD_ID is missing in .env file!');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Check if commands folder exists
if (!fs.existsSync(commandsPath)) {
  console.error('❌ Commands folder not found!');
  process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`📂 Found ${commandFiles.length} command file(s)\n`);

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    console.log(`✅ Loaded: ${command.data.name}`);
  } else {
    console.log(`⚠️  Skipped: ${file} (missing data or execute)`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`\n🔄 Refreshing ${commands.length} application (/) commands...`);
    console.log(`📍 Client ID: ${process.env.CLIENT_ID}`);
    console.log(`📍 Guild ID: ${process.env.GUILD_ID}\n`);

    const data = await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log(`✅ Successfully registered ${data.length} application commands!`);
    
    // List registered commands
    console.log('\n📋 Registered commands:');
    data.forEach(cmd => {
      console.log(`   - /${cmd.name}: ${cmd.description}`);
    });
    
  } catch (error) {
    console.error('\n❌ Error deploying commands:');
    
    if (error.code === 401) {
      console.error('🔑 Unauthorized - Your BOT_TOKEN is invalid or expired.');
      console.error('   → Go to Discord Developer Portal');
      console.error('   → Bot tab → Reset Token');
      console.error('   → Update BOT_TOKEN in .env file');
    } else if (error.code === 50001) {
      console.error('🚫 Missing Access - Bot is not in the guild.');
      console.error('   → Re-invite your bot to the server');
    } else if (error.code === 10004) {
      console.error('🔍 Unknown Guild - GUILD_ID is incorrect.');
      console.error('   → Right-click your server → Copy Server ID');
      console.error('   → Update GUILD_ID in .env file');
    } else {
      console.error('Details:', error);
    }
    
    process.exit(1);
  }
})();