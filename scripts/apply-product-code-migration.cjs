const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query(`
    ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_code text;

    CREATE INDEX IF NOT EXISTS idx_products_product_code
    ON public.products (product_code);
  `);
  await client.end();

  console.log('product_code migration applied');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
