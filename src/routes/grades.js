const express = require('express');
const router = express.Router();
const pool = require('../db');

// POST /grades — Create a grade
router.post('/', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '"name" is required.' });

    try {
        const result = await pool.query(
            `INSERT INTO grades (name) VALUES ($1) RETURNING *`,
            [name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: `Grade "${name}" already exists.` });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /grades — List all grades
router.get('/', async (_req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM grades ORDER BY name`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
