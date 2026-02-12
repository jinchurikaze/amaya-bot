const express = require('express');
const app = express();

// This creates a simple web server that Replit needs
app.get('/', (req, res) => {
  res.send('✅ Bot is running!');
});

// Health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date() });
});

function keepAlive() {
  app.listen(3000, () => {
    console.log('🌐 Server is ready on port 3000');
  });
}

module.exports = keepAlive;