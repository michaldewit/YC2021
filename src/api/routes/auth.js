const { Router } = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../../db/client');
const { signToken } = require('../middleware/auth');
const { handleValidation } = require('../middleware/validate');

const router = Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// POST /auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password, name } = req.body;

      const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.length) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const { rows } = await db.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
        [email, name, passwordHash]
      );

      const user = rows[0];
      const token = signToken({ userId: user.id, email: user.email });
      res.status(201).json({ token, user });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { rows } = await db.query(
        'SELECT id, email, name, password_hash, is_active FROM users WHERE email = $1',
        [email]
      );

      if (!rows.length) {
        // constant-time reject: still hash to avoid timing oracle
        await bcrypt.compare(password, '$2a$12$invalidhashinvalidhashinvalidha');
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });

      const token = signToken({ userId: user.id, email: user.email });
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
