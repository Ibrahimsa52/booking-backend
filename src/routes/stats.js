const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/stats — Get dashboard summary metrics
router.get('/', async (_req, res) => {
    try {
        const clients = await pool.query('SELECT COUNT(*) FROM students WHERE is_registered = true');
        const pendingRequests = await pool.query("SELECT COUNT(*) FROM bookings WHERE status = 'pending' AND cancelled_at IS NULL");
        const totalGroups = await pool.query('SELECT COUNT(*) FROM groups');
        const waitlistCount = await pool.query('SELECT COUNT(*) FROM waitlist_requests WHERE notified_at IS NULL');
        const availableSeats = await pool.query('SELECT SUM(max_students - booked_count) as total FROM groups');

        res.json({
            total_students: parseInt(clients.rows[0].count, 10) || 0,
            pending_requests: parseInt(pendingRequests.rows[0].count, 10) || 0,
            total_groups: parseInt(totalGroups.rows[0].count, 10) || 0,
            waitlist_count: parseInt(waitlistCount.rows[0].count, 10) || 0,
            available_seats: parseInt(availableSeats.rows[0].total, 10) || 0
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Internal server error fetching stats.' });
    }
});

module.exports = router;
