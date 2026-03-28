require('dotenv').config();

// ── Start Express API server ──────────────────────────────────────────────────
const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 API running on http://localhost:${PORT}`);
});

// ── Start Telegram bot (registers polling + all handlers) ─────────────────────
require('./bot/handlers');
console.log('🤖 Telegram bot started');
