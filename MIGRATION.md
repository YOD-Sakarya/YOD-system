# Service migration

`server/migrate-environment.ts` is an explicit, resumable copy workflow. It is
never run by application startup. Source credentials come from the ignored root
`Yod_System.env`; destination credentials come from ignored `redesign/.env`.
Keep those files and `.migration-data/` out of version control.

The destination PostgreSQL connection is supplied as `MIGRATION_DATABASE_URL`.
The destination Cloudinary account must differ from the source account. The
workflow checks both identities against its checkpoint before resuming.

```powershell
node --import tsx server/migrate-environment.ts
```

The current helper expects PostgreSQL 18 command-line tools under
`C:\Program Files\PostgreSQL\18\bin`. It uses certificate verification and
channel binding for dump/restore connections. The certificate bundle is derived
from Node's trusted root certificates, rather than disabling verification.

The workflow:

1. Exports a consistent read-only source snapshot and creates a custom-format
   backup. It records table counts and content fingerprints for that snapshot.
2. Restores only into an empty destination, in one transaction. A resumed run
   accepts existing tables only if they match the saved snapshot exactly.
3. Copies source Cloudinary assets into a unique destination folder, preserving
   existing destination assets. Each copied asset is downloaded again and
   checked against the source bytes using SHA-256. Four bounded workers copy
   files while a serialized checkpoint writer records progress. On the first
   error, workers stop taking new files and finish in-flight operations before
   reporting the failure. Checkpoints allow resuming.
4. Copies available historical local uploads and verifies their destination
   bytes. Already absent local files retain their document records and paths
   and are reported separately.
5. Updates destination document links to verified copies, then verifies all
   table counts and unchanged metadata. Source records and source files remain
   untouched.
6. Only after verification, replaces the local `DATABASE_URL` with the new
   destination URL and removes `MIGRATION_DATABASE_URL`. Other configuration,
   including the Neon Auth URL/provider settings, is preserved.

The `.migration-data/` directory contains the backup, source inventory, trusted
certificate bundle, and checkpoint. Treat it as private recovery data. Preserve
it until the migration and application checks have been accepted; never commit
or publish it.

Do not delete a checkpoint to restart against an occupied destination. Resolve
the reported discrepancy and resume the same workflow instead. The script
refuses unexpected destination contents rather than overwriting them.
