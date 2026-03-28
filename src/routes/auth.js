const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'booking_dashboard_secret_2024';

// ── Setup: create table + default super_admin ────────────────────────────────
async function ensureDashboardUsers() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS dashboard_users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    `);

    const res = await pool.query(`SELECT id FROM dashboard_users WHERE username = 'ibrahim'`);
    if (res.rows.length === 0) {
        const hash = await bcrypt.hash('Ibrahim52', 10);
        await pool.query(
            `INSERT INTO dashboard_users (username, password_hash, role) VALUES ('ibrahim', $1, 'super_admin')`,
            [hash]
        );
        console.log('[Auth] Default super_admin account created.');
    }
}

ensureDashboardUsers().catch(console.error);

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    try {
        const result = await pool.query(`SELECT * FROM dashboard_users WHERE username = $1`, [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
        }
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        res.json({ token, username: user.username, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// GET /api/auth/users  (super_admin only)
router.get('/users', async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, role, created_at FROM dashboard_users ORDER BY created_at ASC`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/auth/users — Create a user (super_admin only)
router.post('/users', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required.' });
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO dashboard_users (username, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id, username, role, created_at`,
            [username, hash]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'اسم المستخدم موجود بالفعل.' });
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// DELETE /api/auth/users/:id — Delete a user (super_admin only, can't delete self)
router.delete('/users/:id', async (req, res) => {
    try {
        const check = await pool.query(`SELECT username FROM dashboard_users WHERE id = $1`, [req.params.id]);
        if (!check.rows.length) return res.status(404).json({ error: 'User not found.' });
        if (check.rows[0].username === 'ibrahim') {
            return res.status(403).json({ error: 'لا يمكن حذف الحساب الرئيسي.' });
        }
        await pool.query(`DELETE FROM dashboard_users WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/auth/change-password — Change own password
router.post('/change-password', async (req, res) => {
    const { username, current_password, new_password } = req.body;
    if (!username || !current_password || !new_password) {
        return res.status(400).json({ error: 'All fields required.' });
    }
    try {
        const result = await pool.query(`SELECT * FROM dashboard_users WHERE username = $1`, [username]);
        if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
        const user = result.rows[0];
        const match = await bcrypt.compare(current_password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
        const hash = await bcrypt.hash(new_password, 10);
        await pool.query(`UPDATE dashboard_users SET password_hash = $1 WHERE id = $2`, [hash, user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
