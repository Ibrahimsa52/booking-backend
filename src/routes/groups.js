const express = require('express');
const router = express.Router();
const pool = require('../db');

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// POST /groups — Create a group under a grade
router.post('/', async (req, res) => {
    const { grade_id, name, day_of_week, start_time, end_time, max_students } = req.body;

    if (!grade_id || !name || !day_of_week || !start_time || !end_time || !max_students) {
        return res.status(400).json({ error: 'All fields are required: grade_id, name, day_of_week, start_time, end_time, max_students.' });
    }
    if (!VALID_DAYS.includes(day_of_week)) {
        return res.status(400).json({ error: `day_of_week must be one of: ${VALID_DAYS.join(', ')}.` });
    }
    if (typeof max_students !== 'number' || max_students < 1) {
        return res.status(400).json({ error: 'max_students must be a positive integer.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO groups (grade_id, name, day_of_week, start_time, end_time, max_students)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
            [grade_id, name, day_of_week, start_time, end_time, max_students]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23503') {
            return res.status(404).json({ error: 'Grade not found.' });
        }
        if (err.code === '23505') {
            return res.status(409).json({ error: `A group named "${name}" already exists in this grade.` });
        }
        if (err.code === '23514') {
            return res.status(400).json({ error: 'end_time must be after start_time.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /groups?grade_id=... — List groups (optionally filter by grade)
router.get('/', async (req, res) => {
    const { grade_id } = req.query;

    try {
        let query = `
      SELECT
        g.id,
        g.name,
        g.day_of_week,
        g.start_time,
        g.end_time,
        g.max_students,
        g.booked_count,
        (g.max_students - g.booked_count) AS available_seats,
        gr.name AS grade_name
      FROM groups g
      JOIN grades gr ON gr.id = g.grade_id
    `;
        const params = [];

        if (grade_id) {
            query += ` WHERE g.grade_id = $1`;
            params.push(grade_id);
        }

        query += ` ORDER BY g.day_of_week, g.start_time`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /groups/:id — Get a single group
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT g.*, (g.max_students - g.booked_count) AS available_seats, gr.name AS grade_name
       FROM groups g JOIN grades gr ON gr.id = g.grade_id
       WHERE g.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// PATCH /groups/:id — Update a group's fields
router.patch('/:id', async (req, res) => {
    const { name, day_of_week, start_time, end_time, max_students } = req.body;
    if (day_of_week && !VALID_DAYS.includes(day_of_week)) {
        return res.status(400).json({ error: `day_of_week must be one of: ${VALID_DAYS.join(', ')}.` });
    }
    try {
        const result = await pool.query(
            `UPDATE groups
             SET name         = COALESCE($1, name),
                 day_of_week  = COALESCE($2, day_of_week),
                 start_time   = COALESCE($3, start_time),
                 end_time     = COALESCE($4, end_time),
                 max_students = COALESCE($5, max_students)
             WHERE id = $6
             RETURNING *`,
            [name || null, day_of_week || null, start_time || null, end_time || null, max_students || null, req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Group not found.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /groups/:id — Delete a group
router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(`DELETE FROM groups WHERE id = $1 RETURNING id`, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found.' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
