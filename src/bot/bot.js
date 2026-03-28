const TelegramBot = require('node-telegram-bot-api');

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.message);
});

module.exports = bot;
