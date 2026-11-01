import pg from 'pg';
import { v2 as cloudinary } from 'cloudinary';
import { config, legacyCloud } from './config.js';
const destinationUrl = process.env.MIGRATION_DATABASE_URL;
if (!destinationUrl) throw new Error('Set MIGRATION_DATABASE_URL in the ignored .env file.');
const source = new pg.Client(config.database),
  destination = new pg.Client({ connectionString: destinationUrl });
try {
  await source.connect();
  await destination.connect();
  for (const [name, client] of [
    ['source', source],
    ['destination', destination],
  ] as const) {
    await client.query('BEGIN READ ONLY');
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`))
      .rows;
    const counts: Record<string, number> = {};
    for (const { tablename } of tables)
      counts[tablename] = Number(
        (await client.query(`SELECT count(*) FROM public."${tablename.replaceAll('"', '""')}"`)).rows[0].count,
      );
    console.log(JSON.stringify({ database: name, tables: counts }));
    if (name === 'source' && tables.some(t => t.tablename === 'Documents')) {
      const paths = (await client.query('SELECT "FilePath" FROM "Documents"')).rows;
      console.log(
        JSON.stringify({
          documentFiles: paths.length,
          uniqueFiles: new Set(paths.map(p => p.FilePath)).size,
          cloudinary: paths.filter(p => String(p.FilePath).startsWith('https://res.cloudinary.com/')).length,
          local: paths.filter(p => !String(p.FilePath).startsWith('https://res.cloudinary.com/')).length,
        }),
      );
    }
    await client.query('ROLLBACK');
  }
  for (const [name, account] of [
    ['source', legacyCloud],
    ['destination', config.cloud],
  ] as const) {
    cloudinary.config(account);
    let total = 0,
      bytes = 0;
    for (const resource_type of ['image', 'raw', 'video']) {
      for (const type of ['upload', 'private', 'authenticated']) {
        let next_cursor: string | undefined;
        do {
          const result = await cloudinary.api.resources({ resource_type, type, max_results: 500, next_cursor });
          total += result.resources.length;
          bytes += result.resources.reduce((n: number, a: { bytes: number }) => n + a.bytes, 0);
          next_cursor = result.next_cursor;
        } while (next_cursor);
      }
    }
    console.log(JSON.stringify({ cloudinary: name, assets: total, bytes }));
  }
} catch (error) {
  console.error('Inventory failed:', error instanceof Error ? error.name : 'service error');
  process.exitCode = 1;
} finally {
  await source.end().catch(() => {});
  await destination.end().catch(() => {});
}
