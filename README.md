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

Run the backend smoke tests with:

```powershell
npm.cmd test
```"
