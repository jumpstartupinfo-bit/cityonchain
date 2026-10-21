import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../auth';
import type { AuthedRequest } from '../auth';

const router = Router();

// Get user's owned assets
router.get('/assets', requireAuth, async (req: AuthedRequest, res) => {
  const mayorCities = await query(
    `SELECT c.*, 'mayor' AS asset_type FROM cities c WHERE c.mayor_owner_id = $1`,
    [req.userId]
  );
  const districts = await query(
    `SELECT d.*, c.name AS city_name, c.slug AS city_slug, c.country, 'district' AS asset_type
     FROM districts d JOIN cities c ON c.id = d.city_id WHERE d.owner_id = $1`,
    [req.userId]
  );
  res.json({ mayorCities, districts });
});

// Wallet ledger
router.get('/transactions', requireAuth, async (req: AuthedRequest, res) => {
  const txs = await query(
    `SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.userId]
  );
  res.json(txs);
});

// Active listings by this user
router.get('/listings', requireAuth, async (req: AuthedRequest, res) => {
  const listings = await query(
    `SELECT l.*,
            CASE WHEN l.asset_type = 'district' THEN
              (SELECT c.name || ' - District ' || (d.index + 1) FROM districts d JOIN cities c ON c.id = d.city_id WHERE d.id = l.asset_id)
            ELSE (SELECT name FROM cities WHERE id = l.asset_id) END AS asset_label
     FROM listings l WHERE l.seller_id = $1 AND l.status = 'active' ORDER BY l.created_at DESC`,
    [req.userId]
  );
  res.json(listings);
});

export default router;
