require('dotenv').config();

// ── Start Express API server ──────────────────────────────────────────────────
const app = require('./app');

// مهم: Railway بيدي PORT تلقائي
const PORT = process.env.PORT || 3000;

// مهم جدًا: 0.0.0.0 بدل localhost
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

// ── Start Telegram bot (registers polling + all handlers) ─────────────────────
require('./bot/handlers');
console.log('🤖 Telegram bot started');
