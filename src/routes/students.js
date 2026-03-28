const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /students — Register or fetch a student
// Called at /start to create a skeleton record, then again after collecting full info
router.post('/', async (req, res) => {
    const { telegram_user_id, full_name, phone_number, is_registered } = req.body;

    if (!telegram_user_id || !full_name) {
        return res.status(400).json({ error: '"telegram_user_id" and "full_name" are required.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO students (telegram_user_id, full_name, phone_number, is_registered)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (telegram_user_id) DO UPDATE
         SET full_name     = EXCLUDED.full_name,
             phone_number  = COALESCE(EXCLUDED.phone_number, students.phone_number),
             is_registered = EXCLUDED.is_registered OR students.is_registered
       RETURNING *`,
            [telegram_user_id, full_name, phone_number || null, is_registered || false]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /students/:telegram_user_id
router.get('/:telegram_user_id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM students WHERE telegram_user_id = $1`,
            [req.params.telegram_user_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Student not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
