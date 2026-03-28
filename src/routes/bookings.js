const express = require('express');
const router = express.Router();
const pool = require('../db');

// ─── GET /bookings/pending ─────────────────────────────────────────────────
// Must be declared BEFORE /:id to prevent "pending" matching as an :id param
router.get('/pending', async (_req, res) => {
    try {
        const result = await pool.query(`
      SELECT
        b.id,
        b.status,
        b.parent_phone,
        b.booked_at,
        s.full_name,
        s.phone_number,
        s.telegram_user_id,
        g.name       AS group_name,
        g.day_of_week,
        g.start_time,
        g.end_time,
        gr.name      AS grade_name
      FROM bookings b
      JOIN students s  ON s.id  = b.student_id
      JOIN groups   g  ON g.id  = b.group_id
      JOIN grades   gr ON gr.id = g.grade_id
      WHERE b.status = 'pending'
        AND b.cancelled_at IS NULL
      ORDER BY b.booked_at ASC
    `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── GET /bookings?student_id= ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    const { student_id } = req.query;
    if (!student_id) {
        return res.status(400).json({ error: '"student_id" query parameter is required.' });
    }
    try {
        const result = await pool.query(`
      SELECT
        b.id,
        b.status,
        b.booked_at,
        b.cancelled_at,
        g.name       AS group_name,
        g.day_of_week,
        g.start_time,
        g.end_time,
        gr.name      AS grade_name
      FROM bookings b
      JOIN groups   g  ON g.id  = b.group_id
      JOIN grades   gr ON gr.id = g.grade_id
      WHERE b.student_id = $1
        AND b.cancelled_at IS NULL
      ORDER BY b.booked_at DESC
    `, [student_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── POST /bookings ─────────────────────────────────────────────────────────
// Pending bookings do NOT reserve a seat. Capacity is checked on approval.
router.post('/', async (req, res) => {
    const { student_id, group_id, parent_phone } = req.body;
    if (!student_id || !group_id) {
        return res.status(400).json({ error: '"student_id" and "group_id" are required.' });
    }

    try {
        // One active request per student
        const existing = await pool.query(
            `SELECT id FROM bookings
       WHERE student_id = $1 AND cancelled_at IS NULL AND status != 'rejected'`,
            [student_id]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Student already has an active booking request.' });
        }

        const result = await pool.query(
            `INSERT INTO bookings (student_id, group_id, parent_phone, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
            [student_id, group_id, parent_phone || null]
        );
        res.status(201).json({ message: 'Booking request submitted.', booking: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ─── PATCH /bookings/:id/status ────────────────────────────────────────────
// Admin: approve or reject a booking
router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: '"status" must be "approved" or "rejected".' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch booking with student info
        const bookingResult = await client.query(`
      SELECT b.*, s.telegram_user_id, s.full_name,
             g.name AS group_name, g.booked_count, g.max_students
      FROM bookings b
      JOIN students s ON s.id = b.student_id
      JOIN groups   g ON g.id = b.group_id
      WHERE b.id = $1
        AND b.cancelled_at IS NULL
        AND b.status = 'pending'
      FOR UPDATE
    `, [req.params.id]);

        if (bookingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending booking not found.' });
        }

        const booking = bookingResult.rows[0];

        if (status === 'approved') {
            // Check capacity before approving
            if (booking.booked_count >= booking.max_students) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Group is full. Cannot approve.' });
            }
            // Reserve the seat
            await client.query(
                `UPDATE groups SET booked_count = booked_count + 1 WHERE id = $1`,
                [booking.group_id]
            );
        }

        // Update booking status
        const updated = await client.query(
            `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
            [status, req.params.id]
        );

        await client.query('COMMIT');
        res.json({
            message: `Booking ${status}.`,
            booking: updated.rows[0],
            // Return student's Telegram ID so the bot can send a notification
            telegram_user_id: booking.telegram_user_id,
            student_name: booking.full_name,
            group_name: booking.group_name,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

// ─── DELETE /bookings/:id ───────────────────────────────────────────────────
// Cancel a booking. If it was approved, frees the seat and returns the next
// waitlisted student to notify (ordered queue).
router.delete('/:id', async (req, res) => {
    const { student_id } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT b.*, s.telegram_user_id FROM bookings b
       JOIN students s ON s.id = b.student_id
       WHERE b.id = $1 AND b.cancelled_at IS NULL FOR UPDATE`,
            [req.params.id]
        );
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Booking not found or already cancelled.' });
        }

        const booking = existing.rows[0];

        if (student_id && booking.student_id !== student_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'You can only cancel your own bookings.' });
        }

        // If booking was approved, free the seat
        if (booking.status === 'approved') {
            await client.query(
                `UPDATE groups SET booked_count = booked_count - 1 WHERE id = $1`,
                [booking.group_id]
            );
        }

        // Cancel the booking
        await client.query(
            `UPDATE bookings SET cancelled_at = NOW() WHERE id = $1`,
            [req.params.id]
        );

        // Find next person in waitlist queue (ordered by created_at, not yet notified)
        let nextInQueue = null;
        if (booking.status === 'approved') {
            const waitlistResult = await client.query(`
        SELECT w.id, w.student_id, s.telegram_user_id, s.full_name
        FROM waitlist_requests w
        JOIN students s ON s.id = w.student_id
        WHERE w.group_id = $1
          AND w.type = 'waitlist'
          AND w.notified_at IS NULL
        ORDER BY w.created_at ASC
        LIMIT 1
        FOR UPDATE OF w
      `, [booking.group_id]);

            if (waitlistResult.rows.length > 0) {
                nextInQueue = waitlistResult.rows[0];
                // Mark as notified so they aren't pinged again
                await client.query(
                    `UPDATE waitlist_requests SET notified_at = NOW() WHERE id = $1`,
                    [nextInQueue.id]
                );
            }
        }

        await client.query('COMMIT');
        res.json({
            message: 'Booking cancelled.',
            notify_waitlist: nextInQueue
                ? { telegram_user_id: nextInQueue.telegram_user_id, full_name: nextInQueue.full_name }
                : null,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    } finally {
        client.release();
    }
});

module.exports = router;
