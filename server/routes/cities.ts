import { Router } from 'express';
import { query, queryOne } from '../db';
import { optionalAuth } from '../auth';
import type { AuthedRequest } from '../auth';

const router = Router();

// List cities with filters
router.get('/', async (req, res) => {
  const { country, continent, available, search, sort = 'population', page = '1', limit = '50' } = req.query as Record<string, string>;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (country) { conditions.push(`c.country ILIKE $${pi++}`); params.push(`%${country}%`); }
  if (continent) { conditions.push(`c.continent = $${pi++}`); params.push(continent); }
  if (available === 'true') { conditions.push(`c.mayor_owner_id IS NULL`); }
  if (available === 'false') { conditions.push(`c.mayor_owner_id IS NOT NULL`); }
  if (search) {
    conditions.push(`(c.name ILIKE $${pi} OR c.country ILIKE $${pi})`);
    params.push(`%${search}%`); pi++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderMap: Record<string, string> = {
    population: 'c.population DESC',
    price: 'c.mayor_price ASC',
    activity: 'c.activity_score DESC',
    name: 'c.name ASC',
  };
  const order = orderMap[sort] ?? 'c.population DESC';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const cities = await query(
    `SELECT c.id, c.name, c.country, c.continent, c.lat, c.lng, c.population,
            c.tier, c.mayor_price, c.activity_score, c.total_revenue, c.slug, c.available,
            c.mayor_owner_id, u.username AS mayor_username, u.avatar_color AS mayor_avatar_color,
            (SELECT COUNT(*) FROM districts d WHERE d.city_id = c.id) AS district_count,
            (SELECT COUNT(*) FROM districts d WHERE d.city_id = c.id AND d.owner_id IS NOT NULL) AS owned_districts
     FROM cities c LEFT JOIN users u ON u.id = c.mayor_owner_id
     ${where} ORDER BY ${order} LIMIT $${pi} OFFSET $${pi + 1}`,
    [...params, parseInt(limit), offset]
  );
  const [{ count }] = await query<{ count: string }>(`SELECT COUNT(*) FROM cities c ${where}`, params);
  res.json({ cities, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
});

// Get single city
router.get('/:slug', optionalAuth, async (req: AuthedRequest, res) => {
  const city = await queryOne(
    `SELECT c.*, u.username AS mayor_username, u.avatar_color AS mayor_avatar_color
     FROM cities c LEFT JOIN users u ON u.id = c.mayor_owner_id
     WHERE c.slug = $1`,
    [req.params.slug]
  );
  if (!city) { res.status(404).json({ error: 'City not found' }); return; }
  const districts = await query(
    `SELECT d.*, u.username AS owner_username, u.avatar_color AS owner_avatar_color
     FROM districts d LEFT JOIN users u ON u.id = d.owner_id
     WHERE d.city_id = $1 ORDER BY d.index`,
    [(city as { id: number }).id]
  );
  const recentTx = await query(
    `SELECT t.type, t.amount, t.description, t.created_at, u.username
     FROM transactions t JOIN users u ON u.id = t.user_id
     WHERE t.ref_type = 'city' AND t.ref_id = $1
     ORDER BY t.created_at DESC LIMIT 10`,
    [(city as { id: number }).id]
  );
  res.json({ city, districts, recentActivity: recentTx });
});

// Get map data (lightweight, all cities)
router.get('/map/all', async (_req, res) => {
  const cities = await query(
    `SELECT id, name, country, lat, lng, population, tier, mayor_price,
            activity_score, slug, mayor_owner_id,
            (SELECT COUNT(*) FROM districts d WHERE d.city_id = cities.id AND d.owner_id IS NOT NULL)::int AS owned_districts,
            (SELECT COUNT(*) FROM districts d WHERE d.city_id = cities.id)::int AS district_count
     FROM cities ORDER BY population DESC`
  );
  res.json(cities);
});

export default router;
