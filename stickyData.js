const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "stickyMessages.json");

function loadStickyData() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2));
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    console.error("Failed to load stickyMessages.json:", err);
    return {};
  }
}

function saveStickyData(data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save stickyMessages.json:", err);
  }
}

module.exports = {
  loadStickyData,
  saveStickyData,
};