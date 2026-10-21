import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, queryOne } from '../db';
import { signToken, requireAuth } from '../auth';
import type { AuthedRequest } from '../auth';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body as { username: string; email: string; password: string };
  if (!username || !email || !password) { res.status(400).json({ error: 'Missing fields' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'Password too short' }); return; }
  const hash = await bcrypt.hash(password, 10);
  const colors = ['#acc6e9','#f59e0b','#34d399','#f472b6','#a78bfa','#fb923c'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  try {
    const [user] = await query<{ id: number; username: string; email: string; balance: string }>(
      `INSERT INTO users (username, email, password_hash, avatar_color, balance)
       VALUES ($1, $2, $3, $4, 1000)
       RETURNING id, username, email, balance`,
      [username.trim(), email.toLowerCase().trim(), hash, color]
    );
    // Give new user starter credits in ledger
    await query(
      `INSERT INTO transactions (user_id, type, amount, description, balance_after)
       VALUES ($1, 'credit', 1000, 'Welcome bonus', 1000)`,
      [user.id]
    );
    res.json({ token: signToken(user.id), user: { id: user.id, username: user.username, email: user.email, balance: parseFloat(user.balance) } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique')) { res.status(409).json({ error: 'Username or email already taken' }); return; }
    throw e;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await queryOne<{ id: number; username: string; email: string; password_hash: string; balance: string; avatar_color: string }>(
    'SELECT id, username, email, password_hash, balance, avatar_color FROM users WHERE email = $1',
    [email?.toLowerCase().trim()]
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }
  res.json({ token: signToken(user.id), user: { id: user.id, username: user.username, email: user.email, balance: parseFloat(user.balance), avatarColor: user.avatar_color } });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await queryOne<{ id: number; username: string; email: string; balance: string; avatar_color: string; created_at: string }>(
    'SELECT id, username, email, balance, avatar_color, created_at FROM users WHERE id = $1',
    [req.userId]
  );
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ id: user.id, username: user.username, email: user.email, balance: parseFloat(user.balance), avatarColor: user.avatar_color, createdAt: user.created_at });
});

export default router;
