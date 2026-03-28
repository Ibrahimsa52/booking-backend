const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /waitlist — Join waitlist for a full group, or register general interest
router.post('/', async (req, res) => {
    const { student_id, group_id, preferred_time_text, type } = req.body;

    if (!student_id || !type) {
        return res.status(400).json({ error: '"student_id" and "type" are required.' });
    }
    if (!['waitlist', 'general'].includes(type)) {
        return res.status(400).json({ error: '"type" must be "waitlist" or "general".' });
    }
    if (type === 'waitlist' && !group_id) {
        return res.status(400).json({ error: '"group_id" is required for waitlist type.' });
    }


    try {
        // One active request per student: check existing waitlist entry
        const existing = await pool.query(
            `SELECT id FROM waitlist_requests WHERE student_id = $1 AND notified_at IS NULL`,
            [student_id]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Student already has an active waitlist request.' });
        }

        const result = await pool.query(
            `INSERT INTO waitlist_requests (student_id, group_id, preferred_time_text, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
            [student_id, group_id || null, preferred_time_text || null, type]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /waitlist/general — All un-notified general interest entries (notify on new group)
router.get('/general', async (_req, res) => {
    try {
        const result = await pool.query(`
      SELECT w.*, s.full_name, s.telegram_user_id
      FROM waitlist_requests w
      JOIN students s ON s.id = w.student_id
      WHERE w.type = 'general' AND w.notified_at IS NULL
      ORDER BY w.created_at ASC
    `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /waitlist/notify-general — Mark all general interest as notified (call after sending msgs)
router.post('/notify-general', async (_req, res) => {
    try {
        await pool.query(
            `UPDATE waitlist_requests SET notified_at = NOW()
       WHERE type = 'general' AND notified_at IS NULL`
        );
        res.json({ message: 'General interest list marked as notified.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
