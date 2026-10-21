import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

export async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS earnings_events (
      id           SERIAL PRIMARY KEY,
      wallet       TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      amount_raw   TEXT NOT NULL DEFAULT '0',
      amount_usd   NUMERIC(18,6) NOT NULL DEFAULT 0,
      tx_hash      TEXT NOT NULL,
      log_index    INTEGER NOT NULL,
      block_number BIGINT NOT NULL,
      block_time   BIGINT,
      metadata     JSONB DEFAULT '{}',
      UNIQUE(tx_hash, log_index)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_earnings_wallet ON earnings_events(wallet)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_earnings_block  ON earnings_events(block_number DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

  console.log('[db] schema ready');
}

export async function getLastIndexedBlock(): Promise<bigint> {
  const rows = await sql`SELECT value FROM indexer_state WHERE key = 'last_block'`;
  return rows.length > 0 ? BigInt(rows[0].value as string) : 0n;
}

export async function setLastIndexedBlock(block: bigint) {
  await sql`
    INSERT INTO indexer_state (key, value) VALUES ('last_block', ${block.toString()})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export interface EarningsRow {
  id: number;
  wallet: string;
  event_type: string;
  amount_raw: string;
  amount_usd: string;
  tx_hash: string;
  log_index: number;
  block_number: string;
  block_time: string | null;
  metadata: Record<string, unknown>;
}

export async function insertEvent(row: Omit<EarningsRow, 'id'>) {
  await sql`
    INSERT INTO earnings_events
      (wallet, event_type, amount_raw, amount_usd, tx_hash, log_index, block_number, block_time, metadata)
    VALUES (
      ${row.wallet.toLowerCase()},
      ${row.event_type},
      ${row.amount_raw},
      ${row.amount_usd},
      ${row.tx_hash},
      ${row.log_index},
      ${row.block_number},
      ${row.block_time ?? null},
      ${JSON.stringify(row.metadata)}
    )
    ON CONFLICT (tx_hash, log_index) DO NOTHING
  `;
}

export async function getEarningsForWallet(wallet: string, limit = 200): Promise<EarningsRow[]> {
  return sql`
    SELECT * FROM earnings_events
    WHERE wallet = ${wallet.toLowerCase()}
    ORDER BY block_number DESC, log_index DESC
    LIMIT ${limit}
  ` as unknown as EarningsRow[];
}
