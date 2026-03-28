const pool = require('./src/db');

async function migrate() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dashboard_users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Created dashboard_users table.');

        // Insert default super_admin (ibrahim / Ibrahim52) if not exists
        // Note: We need a hashing library. I will use crypto to generate a simple hash, or bcrypt if installed.
        // Wait, is bcrypt installed? No, package.json doesn't list it. 
        // I will install bcryptjs or jsonwebtoken. Let's install jsonwebtoken and bcryptjs.
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
