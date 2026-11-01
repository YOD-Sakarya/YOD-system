import pg from 'pg';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { rootCertificates } from 'node:tls';
import { config, parseConnectionString, root } from './config.js';

// Explicitly invoked migration, never run by app startup. All credentials remain in ignored env files.
const oldEnv = dotenv.parse(await fs.readFile(path.join(root, '..', 'Yod_System.env')));
const sourceConfig = parseConnectionString(oldEnv.ConnectionStrings__DefaultConnection);
const targetUrl = process.env.MIGRATION_DATABASE_URL;
if (!targetUrl) throw new Error('Set MIGRATION_DATABASE_URL in redesign/.env.');
const target = new URL(targetUrl);
if (sourceConfig.host === target.hostname && sourceConfig.database === decodeURIComponent(target.pathname.slice(1))) throw new Error('Source and destination must differ.');
const sourceCloud = { cloud_name: oldEnv.Cloudinary__CloudName, api_key: oldEnv.Cloudinary__ApiKey, api_secret: oldEnv.Cloudinary__ApiSecret };
if (!config.cloud.cloud_name || config.cloud.cloud_name === sourceCloud.cloud_name) throw new Error('Set a different destination CLOUDINARY_URL.');
let source = new pg.Client(sourceConfig), destination = new pg.Client({ connectionString: targetUrl });
// Serverless Postgres drops idle connections during the long asset copy; an unhandled 'error' would crash the run.
source.on('error', () => {}); destination.on('error', () => {});
async function reconnect() {
  await source.end().catch(() => {}); await destination.end().catch(() => {});
  source = new pg.Client(sourceConfig); destination = new pg.Client({ connectionString: targetUrl });
  source.on('error', () => {}); destination.on('error', () => {});
  await source.connect(); await destination.connect();
  await source.query("SET TIME ZONE 'UTC'"); await destination.query("SET TIME ZONE 'UTC'");
}
const stateDir = path.join(root, '.migration-data');
await fs.mkdir(stateDir, { recursive: true });
const caPath = path.join(stateDir, 'trusted-ca.pem');
await fs.writeFile(caPath, rootCertificates.join('\n'));
type Asset = { public_id: string; resource_type: string; type: string; secure_url: string; bytes: number; format?: string; version: number; tags?: string[]; context?: { custom?: Record<string,string> } };
type Mapping = { source: string; destination: string; bytes: number; sha256: string };
type State = { prefix: string; sourceHost: string; destinationHost: string; sourceDatabase: string; destinationDatabase: string; sourceCloud: string; destinationCloud: string; databaseRestored: boolean; dumpReady?: boolean; documentsWithoutPaths?: {count:number;hash:string}; documentPaths?: Record<string,string>; expected: Record<string,{count:number;hash:string}>; assets: Record<string,Mapping>; missingLocal: number[]; finished?: boolean };
const statePath = path.join(stateDir, 'state.json');
let state: State;
try { state = JSON.parse(await fs.readFile(statePath,'utf8')); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Migration state is unreadable or invalid. Refusing to create a new migration.');
  state = { prefix: `yod_import_${new Date().toISOString().slice(0,10).replaceAll('-','')}_${randomBytes(4).toString('hex')}`, sourceHost: sourceConfig.host, destinationHost: target.hostname, sourceDatabase: sourceConfig.database, destinationDatabase: decodeURIComponent(target.pathname.slice(1)), sourceCloud: sourceCloud.cloud_name, destinationCloud: config.cloud.cloud_name, databaseRestored: false, expected: {}, assets: {}, missingLocal: [] };
}
if (state.sourceHost !== sourceConfig.host || state.destinationHost !== target.hostname || state.sourceCloud !== sourceCloud.cloud_name || state.destinationCloud !== config.cloud.cloud_name || state.sourceDatabase !== sourceConfig.database || state.destinationDatabase !== decodeURIComponent(target.pathname.slice(1))) throw new Error('Migration state belongs to different services or databases.');
// Only one writer owns the checkpoint's temporary file, even while assets copy
// concurrently. Each queued write takes its snapshot when it starts.
let checkpointQueue: Promise<void> = Promise.resolve();
const checkpoint = () => {
  const write = checkpointQueue.then(async () => {
    await fs.writeFile(statePath + '.tmp', JSON.stringify(state, null, 2));
    await fs.rename(statePath + '.tmp', statePath);
  });
  checkpointQueue = write;
  return write;
};
const quote = (name: string) => '"' + name.replaceAll('"','""') + '"';
async function fingerprint(client: pg.Client, table: string, omitFilePath = false) {
  return (await client.query(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(row::text,E'\\n' ORDER BY row::text),'')) AS hash FROM (SELECT to_jsonb(t)${omitFilePath ? " - 'FilePath'" : ''} AS row FROM public.${quote(table)} t) data`)).rows[0] as {count:number;hash:string};
}
async function tool(exe: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<string>((resolve,reject) => {
    const child = spawn(path.join('C:\\Program Files\\PostgreSQL\\18\\bin',exe), args, { env: { ...process.env, ...env }, windowsHide: true });
    let stdout = '', stderr = ''; child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    child.on('error', () => reject(new Error(`${exe} could not start.`)));
    child.on('exit', code => {
      let safe = stderr;
      for (const secret of [sourceConfig.password, decodeURIComponent(target.password), sourceCloud.api_secret, config.cloud.api_secret])
        if (secret) safe = safe.replaceAll(secret, '[redacted]');
      safe = safe.replace(/postgres(?:ql)?:\/\/\S+|cloudinary:\/\/\S+/g, '[redacted connection]');
      code === 0 ? resolve(stdout) : reject(new Error(`${exe} failed with exit code ${code}: ${safe.slice(0, 1500)}`));
    });
  });
}
const sourcePg = { PGHOST: sourceConfig.host, PGPORT: String(sourceConfig.port), PGDATABASE: sourceConfig.database, PGUSER: sourceConfig.user, PGPASSWORD: sourceConfig.password, PGSSLMODE: 'verify-full', PGSSLROOTCERT: caPath, PGCHANNELBINDING: 'require' };
const targetPg = { PGHOST: target.hostname, PGPORT: target.port || '5432', PGDATABASE: decodeURIComponent(target.pathname.slice(1)), PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: caPath, PGCHANNELBINDING: 'require' };
async function assetBytes(asset: Asset, account = sourceCloud) {
  const urls = [asset.secure_url, cloudinary.url(asset.public_id, { ...account, resource_type: asset.resource_type, type: asset.type, version: asset.version, format: asset.resource_type === 'raw' ? undefined : asset.format, secure: true, sign_url: true }),
    cloudinary.utils.private_download_url(asset.public_id, asset.resource_type === 'raw' ? '' : asset.format || '', { ...account, resource_type: asset.resource_type, type: asset.type, expires_at: Math.floor(Date.now()/1000)+3600, attachment: true })];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) { await response.body?.cancel(); continue; }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === asset.bytes) return bytes;
    } catch { /* Try the account's signed delivery and download endpoints. */ }
  }
  throw new Error(`Unable to retrieve source asset (${asset.resource_type}); migration can resume.`);
}
async function copyAsset(asset: Asset, key: string) {
  const existing = state.assets[key];
  if (existing) {
    const copied = await assetBytes({ ...asset, secure_url: existing.destination, public_id: `${state.prefix}/${asset.public_id}`, version: Number(new URL(existing.destination).pathname.match(/\/v(\d+)\//)?.[1] || asset.version) }, config.cloud as typeof sourceCloud);
    if (createHash('sha256').update(copied).digest('hex') !== existing.sha256) throw new Error('Previously copied destination asset no longer matches its checkpoint.');
    return;
  }
  const bytes = await assetBytes(asset);
  const publicId = `${state.prefix}/${asset.public_id}`;
  const result = await new Promise<{secure_url:string;bytes:number;etag?:string;version:number;format?:string}>((resolve,reject) => {
    cloudinary.uploader.upload_stream({ ...config.cloud, resource_type: asset.resource_type as 'image'|'video'|'raw', type: asset.type as 'upload'|'private'|'authenticated',
      public_id: publicId, overwrite: false, tags: asset.tags, context: asset.context?.custom },
    (error,result) => error || !result ? reject(new Error('Destination asset upload failed; migration can resume.')) : resolve(result)).end(bytes);
  });
  if (result.bytes !== bytes.length || (result.etag && result.etag !== createHash('md5').update(bytes).digest('hex'))) throw new Error('Destination asset integrity check failed.');
  const verification = await assetBytes({ ...asset, secure_url: result.secure_url, public_id: publicId, version: result.version, format: result.format || asset.format }, config.cloud as typeof sourceCloud);
  if (createHash('sha256').update(verification).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Downloaded destination asset does not match the source content.');
  state.assets[key] = { source: asset.secure_url, destination: result.secure_url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  await checkpoint();
}
try {
  await source.connect(); await destination.connect();
  await source.query("SET TIME ZONE 'UTC'"); await destination.query("SET TIME ZONE 'UTC'");
  await checkpoint();
  if (!state.databaseRestored) {
    const occupied = await destination.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    const dumpPath = path.join(stateDir,'source.dump');
    if (occupied.rowCount) {
      // A restore can commit just before a process interruption. Accept only an exact
      // match to the previously checkpointed snapshot; never restore over any tables.
      if (!state.dumpReady || occupied.rows.length !== Object.keys(state.expected).length) throw new Error('Destination has existing tables. Refusing to overwrite data.');
      for (const { tablename } of occupied.rows) {
        const expected = state.expected[tablename];
        if (!expected) throw new Error('Destination has unexpected tables.');
        const actual = await fingerprint(destination, tablename);
        if (actual.count !== expected.count || actual.hash !== expected.hash) throw new Error('Existing destination does not match the saved snapshot.');
      }
      state.databaseRestored = true; await checkpoint();
    }
    if (!state.databaseRestored) {
    if (!state.dumpReady) {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const tables = (await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    for (const {tablename} of tables) state.expected[tablename] = await fingerprint(source,tablename);
    state.documentsWithoutPaths = await fingerprint(source, 'Documents', true);
    state.documentPaths = Object.fromEntries((await source.query('SELECT "DocId","FilePath" FROM "Documents"')).rows.map(doc => [String(doc.DocId), String(doc.FilePath)]));
    console.log('Creating consistent source database backup.');
    await tool('pg_dump.exe',['--format=custom','--no-owner','--no-privileges','--schema=public',`--snapshot=${snapshot}`,`--file=${dumpPath}`],sourcePg);
    await source.query('ROLLBACK');
    state.dumpReady = true; await checkpoint();
    }
    const list = await tool('pg_restore.exe',['--list',dumpPath],{});
    const listPath = path.join(stateDir,'restore.list');
    await fs.writeFile(listPath,list.split(/\r?\n/).filter(line => !/\bSCHEMA - public\b|\bCOMMENT - SCHEMA public\b/.test(line)).join('\n'));
    console.log('Restoring into the empty destination in a single transaction.');
    await tool('pg_restore.exe',['--single-transaction','--exit-on-error','--no-owner','--no-privileges',`--dbname=${targetPg.PGDATABASE}`,`--use-list=${listPath}`,dumpPath],targetPg);
    for (const [table,expected] of Object.entries(state.expected)) {
      const actual = await fingerprint(destination,table);
      if (actual.count !== expected.count || actual.hash !== expected.hash) throw new Error('Database verification failed for '+table);
    }
    state.databaseRestored = true; await checkpoint();
    console.log('All database table counts and content fingerprints match the source snapshot.');
    }
  }
  cloudinary.config(sourceCloud);
  const inventoryPath = path.join(stateDir,'source-assets.json');
  let assets: Asset[];
  try { assets = JSON.parse(await fs.readFile(inventoryPath,'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved source asset inventory is unreadable or invalid.');
    assets = [];
    for (const resource_type of ['image','raw','video']) for (const type of ['upload','private','authenticated']) {
      let next_cursor: string|undefined;
      do { const page = await cloudinary.api.resources({ ...sourceCloud, resource_type, type, max_results:500, next_cursor, tags:true, context:true }); assets.push(...page.resources); next_cursor=page.next_cursor; } while(next_cursor);
    }
    await fs.writeFile(inventoryPath+'.tmp',JSON.stringify(assets,null,2)); await fs.rename(inventoryPath+'.tmp',inventoryPath);
  }
  console.log(`Copying ${assets.length} Cloudinary assets into an isolated destination folder.`);
  // Bounded workers retain full source/destination verification. On failure, stop
  // taking new work and await all in-flight checks/uploads/checkpoints before exit.
  let nextAsset = 0, completedAssets = 0;
  let assetFailure: unknown;
  async function assetWorker() {
    while (!assetFailure) {
      const index = nextAsset++;
      if (index >= assets.length) return;
      const asset = assets[index];
      try {
        await copyAsset(asset, `${asset.resource_type}/${asset.type}/${asset.public_id}`);
        completedAssets++;
        if (completedAssets%10===0 || completedAssets===assets.length)
          console.log(`Cloudinary assets verified this run: ${completedAssets}/${assets.length}`);
      } catch (error) { assetFailure ||= error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, assets.length) }, () => assetWorker()));
  await checkpointQueue;
  if (assetFailure) throw assetFailure;
  await reconnect();
  const documents = (await destination.query('SELECT "DocId","FilePath" FROM "Documents" ORDER BY "DocId"')).rows;
  const replacements: {id:number;from:string;to:string}[] = [];
  for (const doc of documents) {
    const oldPath = String(doc.FilePath);
    if (oldPath.startsWith(`https://res.cloudinary.com/${config.cloud.cloud_name}/`)) {
      if (!Object.values(state.assets).some(mapping => mapping.destination === oldPath)) throw new Error('Document points to an unverified destination asset.');
      continue;
    }
    if (/^https?:\/\//i.test(oldPath)) {
      const parsed = new URL(oldPath);
      if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.startsWith(`/${sourceCloud.cloud_name}/`)) throw new Error('Document references an unsupported external asset URL.');
      const asset = assets.find(a => new URL(a.secure_url).pathname === parsed.pathname);
      if (!asset) throw new Error('A document references an asset missing from the source account.');
      const mapped = state.assets[`${asset.resource_type}/${asset.type}/${asset.public_id}`];
      replacements.push({id:doc.DocId,from:oldPath,to:mapped.destination});
    } else {
      const webroot = path.resolve(root,'..','Yod_MS3','wwwroot');
      const localPath = path.resolve(webroot,oldPath.replace(/^[/\\]+/,''));
      const relative = path.relative(webroot,localPath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe local file path.');
      let bytes: Buffer;
      try { bytes=await fs.readFile(localPath); } catch { if (!state.missingLocal.includes(doc.DocId)) state.missingLocal.push(doc.DocId); continue; }
      const key = `local/${doc.DocId}`;
      if (!state.assets[key]) {
        const publicId = `${state.prefix}/local/${doc.DocId}${path.extname(localPath)}`;
        const result = await new Promise<{secure_url:string;bytes:number;version:number}>((resolve,reject) => cloudinary.uploader.upload_stream({ ...config.cloud, resource_type:'raw',public_id:publicId,overwrite:false },(error,result)=>error||!result?reject(new Error('Local asset upload failed.')):resolve(result)).end(bytes));
        if (result.bytes!==bytes.length) throw new Error('Local asset size mismatch.');
        const verification = await assetBytes({ public_id:publicId,resource_type:'raw',type:'upload',secure_url:result.secure_url,bytes:bytes.length,version:result.version },config.cloud as typeof sourceCloud);
        if (createHash('sha256').update(verification).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Local asset destination content mismatch.');
        state.assets[key]={source:oldPath,destination:result.secure_url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}; await checkpoint();
      }
      replacements.push({id:doc.DocId,from:oldPath,to:state.assets[key].destination});
    }
  }
  await destination.query('BEGIN');
  try {
    for (const replacement of replacements) {
      const result = await destination.query('UPDATE "Documents" SET "FilePath"=$1 WHERE "DocId"=$2 AND "FilePath"=$3',[replacement.to,replacement.id,replacement.from]);
      if (result.rowCount!==1) throw new Error('Destination changed during migration; refusing to replace file links.');
    }
    await destination.query('COMMIT');
  } catch(error) {await destination.query('ROLLBACK'); throw error;}
  for(const [table,expected] of Object.entries(state.expected)) {
    const actual=await fingerprint(destination,table);
    if (actual.count!==expected.count || (table!=='Documents'&&actual.hash!==expected.hash)) throw new Error('Final database verification failed.');
  }
  const documentContent = await fingerprint(destination, 'Documents', true);
  if (!state.documentsWithoutPaths || documentContent.hash !== state.documentsWithoutPaths.hash || documentContent.count !== state.documentsWithoutPaths.count) throw new Error('Document metadata changed during migration.');
  for (const doc of (await destination.query('SELECT "DocId","FilePath" FROM "Documents"')).rows) {
    const verified = Object.values(state.assets).some(mapping => mapping.destination === doc.FilePath);
    const retainedMissingLocal = state.missingLocal.includes(doc.DocId) && state.documentPaths?.[String(doc.DocId)] === doc.FilePath;
    if (!verified && !retainedMissingLocal) throw new Error('Document link did not resolve to verified content.');
  }
  state.finished=true; await checkpoint();
  console.log(JSON.stringify({ status:'copied', tables:Object.fromEntries(Object.entries(state.expected).map(([k,v])=>[k,v.count])), copiedAssets:Object.keys(state.assets).length, documentLinksUpdated:replacements.length, missingLocalFiles:state.missingLocal.length, sourceUnchanged:true }));
  if (state.missingLocal.length) console.log('Some historical local files were already absent. Their document records and original paths were preserved.');
  const envPath=path.join(root,'.env');
  let envText=await fs.readFile(envPath,'utf8');
  envText=envText.replace(/^DATABASE_URL=.*\r?\n?/gm,'').replace(/^MIGRATION_DATABASE_URL=.*\r?\n?/gm,'');
  envText+='\nDATABASE_URL='+targetUrl+'\n';
  if(!/^JWT_SECRET=/m.test(envText)) envText+='JWT_SECRET='+randomBytes(48).toString('base64url')+'\n';
  await fs.writeFile(envPath+'.tmp',envText); await fs.rename(envPath+'.tmp',envPath);
  console.log('Local .env switched to the destination database and Cloudinary account.');
} catch(error) {
  console.error('Migration stopped:',error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+|cloudinary:\/\/\S+/g,'[redacted connection]') : 'service error');
  console.error('Source services remain unchanged. Resume only after resolving the reported issue.'); process.exitCode=1;
} finally {await source.end().catch(()=>{});await destination.end().catch(()=>{});}
