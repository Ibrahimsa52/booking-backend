const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/grades', require('./routes/grades'));
app.use('/groups', require('./routes/groups'));
app.use('/students', require('./routes/students'));
app.use('/bookings', require('./routes/bookings'));
app.use('/waitlist', require('./routes/waitlist'));
app.use('/api/stats', require('./routes/stats'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Serve Dashboard UI at /dashboard
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
// Redirect root to dashboard
app.get('/', (_req, res) => res.redirect('/dashboard/login.html'));

app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
