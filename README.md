"# store-inventory-management-system

## Backend

The Express API is in `server/` and uses SQLite through Drizzle ORM. Node.js 20
or newer is required.

```powershell
cd server
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

The API starts at `http://localhost:3000`. Check `http://localhost:3000/api/health`
for the health response. The SQLite database is created at `server/data/store.sqlite`
on first start.

To create the database tables and seed an owner plus starter products, set an
owner password and run the seed script from `server/`:

```powershell
$env:SEED_OWNER_PASSWORD = "choose-a-password-of-at-least-12-characters"
npm.cmd run seed
```

The optional `SEED_OWNER_USERNAME` defaults to `owner`. The script uses
`DATABASE_URL` when set, otherwise it seeds `server/data/store.sqlite`. It can
be run repeatedly; existing owner credentials and products are left unchanged.

Run the backend smoke tests with:

```powershell
npm.cmd test
```"
