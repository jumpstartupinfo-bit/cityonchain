import { Router } from 'express';
import { query, queryOne, pool } from '../db';
import { requireAuth } from '../auth';
import type { AuthedRequest } from '../auth';

const router = Router();

// Buy mayor license from platform
router.post('/buy/mayor/:citySlug', requireAuth, async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const city = await client.query(
      'SELECT * FROM cities WHERE slug = $1 FOR UPDATE', [req.params.citySlug]
    ).then(r => r.rows[0]);
    if (!city) { await client.query('ROLLBACK'); res.status(404).json({ error: 'City not found' }); return; }
    if (city.mayor_owner_id) { await client.query('ROLLBACK'); res.status(409).json({ error: 'Mayor license already owned' }); return; }

    const user = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.userId]).then(r => r.rows[0]);
    const price = parseFloat(city.mayor_price);
    if (parseFloat(user.balance) < price) { await client.query('ROLLBACK'); res.status(402).json({ error: 'Insufficient balance' }); return; }

    const newBal = parseFloat(user.balance) - price;
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBal, req.userId]);
    await client.query('UPDATE cities SET mayor_owner_id = $1, mayor_purchased_at = NOW(), available = false WHERE id = $2', [req.userId, city.id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, ref_id, ref_type, balance_after)
       VALUES ($1, 'debit', $2, $3, $4, 'city', $5)`,
      [req.userId, price, `Bought mayor license: ${city.name}`, city.id, newBal]
    );
    await client.query('COMMIT');
    res.json({ success: true, newBalance: newBal });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
});

// Buy district from platform
router.post('/buy/district/:districtId', requireAuth, async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const district = await client.query('SELECT d.*, c.name AS city_name FROM districts d JOIN cities c ON c.id = d.city_id WHERE d.id = $1 FOR UPDATE', [req.params.districtId]).then(r => r.rows[0]);
    if (!district) { await client.query('ROLLBACK'); res.status(404).json({ error: 'District not found' }); return; }
    if (district.owner_id) { await client.query('ROLLBACK'); res.status(409).json({ error: 'District already owned' }); return; }

    const user = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.userId]).then(r => r.rows[0]);
    const price = parseFloat(district.price);
    if (parseFloat(user.balance) < price) { await client.query('ROLLBACK'); res.status(402).json({ error: 'Insufficient balance' }); return; }

    const newBal = parseFloat(user.balance) - price;
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [newBal, req.userId]);
    await client.query('UPDATE districts SET owner_id = $1, purchased_at = NOW(), available = false WHERE id = $2', [req.userId, district.id]);
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, description, ref_id, ref_type, balance_after)
       VALUES ($1, 'debit', $2, $3, $4, 'district', $5)`,
      [req.userId, price, `Bought district ${district.index + 1} in ${district.city_name}`, district.id, newBal]
    );
    await client.query('COMMIT');
    res.json({ success: true, newBalance: newBal });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
});

// List asset for sale or lease
router.post('/list', requireAuth, async (req: AuthedRequest, res) => {
  const { assetType, assetId, price, isLease, leaseMonthly } = req.body as {
    assetType: 'mayor' | 'district'; assetId: number; price: number; isLease: boolean; leaseMonthly?: number;
  };
  // Verify ownership
  let ownerId: number | null = null;
  if (assetType === 'mayor') {
    const city = await queryOne<{ mayor_owner_id: number }>('SELECT mayor_owner_id FROM cities WHERE id = $1', [assetId]);
    ownerId = city?.mayor_owner_id ?? null;
  } else {
    const d = await queryOne<{ owner_id: number }>('SELECT owner_id FROM districts WHERE id = $1', [assetId]);
    ownerId = d?.owner_id ?? null;
  }
  if (ownerId !== req.userId) { res.status(403).json({ error: 'You do not own this asset' }); return; }

  const [listing] = await query(
    `INSERT INTO listings (asset_type, asset_id, seller_id, price, is_lease, lease_monthly)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [assetType, assetId, req.userId, price, isLease ?? false, leaseMonthly ?? null]
  );
  res.json(listing);
});

// Get active listings
router.get('/listings', async (req, res) => {
  const { type, cityId, page = '1', limit = '20' } = req.query as Record<string, string>;
  const conditions = ["l.status = 'active'"];
  const params: unknown[] = [];
  let pi = 1;

  if (type) { conditions.push(`l.asset_type = $${pi++}`); params.push(type); }
  if (cityId) { conditions.push(`(l.asset_type = 'district' AND d.city_id = $${pi} OR l.asset_type = 'mayor' AND c2.id = $${pi})`); params.push(parseInt(cityId)); pi++; }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const listings = await query(
    `SELECT l.*, u.username AS seller_username, u.avatar_color AS seller_color,
            CASE WHEN l.asset_type = 'district' THEN d.name ELSE c2.name END AS asset_name,
            CASE WHEN l.asset_type = 'district' THEN c1.name ELSE NULL END AS city_name,
            CASE WHEN l.asset_type = 'district' THEN c1.slug ELSE c2.slug END AS city_slug
     FROM listings l
     JOIN users u ON u.id = l.seller_id
     LEFT JOIN districts d ON l.asset_type = 'district' AND d.id = l.asset_id
     LEFT JOIN cities c1 ON d.city_id = c1.id
     LEFT JOIN cities c2 ON l.asset_type = 'mayor' AND c2.id = l.asset_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY l.created_at DESC LIMIT $${pi} OFFSET $${pi + 1}`,
    [...params, parseInt(limit), offset]
  );
  res.json(listings);
});

// Buy a listed asset
router.post('/buy/listing/:listingId', requireAuth, async (req: AuthedRequest, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const listing = await client.query("SELECT * FROM listings WHERE id = $1 AND status = 'active' FOR UPDATE", [req.params.listingId]).then(r => r.rows[0]);
    if (!listing) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Listing not found or inactive' }); return; }
    if (listing.seller_id === req.userId) { await client.query('ROLLBACK'); res.status(400).json({ error: 'Cannot buy your own listing' }); return; }

    const buyer = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.userId]).then(r => r.rows[0]);
    const price = parseFloat(listing.price);
    if (parseFloat(buyer.balance) < price) { await client.query('ROLLBACK'); res.status(402).json({ error: 'Insufficient balance' }); return; }

    const split = await client.query("SELECT * FROM revenue_splits WHERE name = 'default'").then(r => r.rows[0]);
    const platformCut = price * (split.platform_pct / 100);
    const sellerCut = price - platformCut;

    const buyerNewBal = parseFloat(buyer.balance) - price;
    const seller = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [listing.seller_id]).then(r => r.rows[0]);
    const sellerNewBal = parseFloat(seller.balance) + sellerCut;

    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [buyerNewBal, req.userId]);
    await client.query('UPDATE users SET balance = $1 WHERE id = $2', [sellerNewBal, listing.seller_id]);
    await client.query("UPDATE listings SET status = 'sold' WHERE id = $1", [listing.id]);

    // Transfer ownership
    if (listing.asset_type === 'mayor') {
      await client.query('UPDATE cities SET mayor_owner_id = $1, mayor_purchased_at = NOW() WHERE id = $2', [req.userId, listing.asset_id]);
    } else {
      await client.query('UPDATE districts SET owner_id = $1, purchased_at = NOW(), available = false WHERE id = $2', [req.userId, listing.asset_id]);
    }

    await client.query(`INSERT INTO transactions (user_id, type, amount, description, ref_id, ref_type, balance_after) VALUES ($1, 'debit', $2, $3, $4, 'listing', $5)`,
      [req.userId, price, `Bought ${listing.asset_type} listing #${listing.id}`, listing.id, buyerNewBal]);
    await client.query(`INSERT INTO transactions (user_id, type, amount, description, ref_id, ref_type, balance_after) VALUES ($1, 'credit', $2, $3, $4, 'listing', $5)`,
      [listing.seller_id, sellerCut, `Sold ${listing.asset_type} listing #${listing.id}`, listing.id, sellerNewBal]);

    await client.query('COMMIT');
    res.json({ success: true, newBalance: buyerNewBal });
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
});

// Cancel listing
router.delete('/listings/:listingId', requireAuth, async (req: AuthedRequest, res) => {
  const listing = await queryOne<{ seller_id: number; status: string }>('SELECT seller_id, status FROM listings WHERE id = $1', [req.params.listingId]);
  if (!listing) { res.status(404).json({ error: 'Not found' }); return; }
  if (listing.seller_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }
  if (listing.status !== 'active') { res.status(400).json({ error: 'Listing not active' }); return; }
  await query("UPDATE listings SET status = 'cancelled' WHERE id = $1", [req.params.listingId]);
  res.json({ success: true });
});

// Make offer
router.post('/offers', requireAuth, async (req: AuthedRequest, res) => {
  const { listingId, amount } = req.body as { listingId: number; amount: number };
  const listing = await queryOne<{ id: number; seller_id: number; status: string }>('SELECT * FROM listings WHERE id = $1', [listingId]);
  if (!listing || listing.status !== 'active') { res.status(404).json({ error: 'Listing not active' }); return; }
  if (listing.seller_id === req.userId) { res.status(400).json({ error: 'Cannot offer on own listing' }); return; }
  const [offer] = await query(
    `INSERT INTO offers (listing_id, buyer_id, amount) VALUES ($1, $2, $3) RETURNING *`,
    [listingId, req.userId, amount]
  );
  res.json(offer);
});

export default router;
