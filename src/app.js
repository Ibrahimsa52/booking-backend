const express = require('express');
const app = express();

app.use(express.json());

app.use('/grades', require('./routes/grades'));
app.use('/groups', require('./routes/groups'));
app.use('/students', require('./routes/students'));
app.use('/bookings', require('./routes/bookings'));
app.use('/waitlist', require('./routes/waitlist'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
