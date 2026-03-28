const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /students — List all students (for dashboard)
router.get('/', async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, telegram_user_id, full_name, phone_number, parent_phone, is_registered, created_at
             FROM students
             ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /students — Register or fetch a student
router.post('/', async (req, res) => {
    const { telegram_user_id, full_name, phone_number, parent_phone, is_registered } = req.body;

    if (!telegram_user_id || !full_name) {
        return res.status(400).json({ error: '"telegram_user_id" and "full_name" are required.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO students (telegram_user_id, full_name, phone_number, parent_phone, is_registered)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (telegram_user_id) DO UPDATE
         SET full_name     = EXCLUDED.full_name,
             phone_number  = COALESCE(EXCLUDED.phone_number, students.phone_number),
             parent_phone  = COALESCE(EXCLUDED.parent_phone, students.parent_phone),
             is_registered = EXCLUDED.is_registered OR students.is_registered
       RETURNING *`,
            [telegram_user_id, full_name, phone_number || null, parent_phone || null, is_registered || false]
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

// DELETE /students/:id — Delete a student by UUID
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM students WHERE id = $1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Student not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /students/:id/request-info — Ask the student to re-enter a missing field via Telegram
router.post('/:id/request-info', async (req, res) => {
    const { field } = req.body; // 'phone_number' | 'parent_phone' | 'full_name'
    if (!field) return res.status(400).json({ error: '"field" is required.' });

    const fieldLabels = {
        phone_number: 'رقم هاتفك',
        parent_phone: 'رقم هاتف ولي الأمر',
        full_name: 'اسمك الثلاثي',
    };

    const label = fieldLabels[field];
    if (!label) return res.status(400).json({ error: 'Invalid field name.' });

    try {
        const result = await pool.query(
            `SELECT telegram_user_id, full_name FROM students WHERE id = $1`,
            [req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Student not found.' });

        const { telegram_user_id, full_name } = result.rows[0];
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        const message = `⚠️ مرحباً *${full_name}*،\nتبين أن بياناتك ناقصة.\nبرجاء إدخال *${label}* عن طريق إرسال /update_info`;

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegram_user_id,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        res.json({ success: true, sent_to: telegram_user_id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;

