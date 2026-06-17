# Deploy PeacocksStreams to production

Production: **https://moneypack.wtf**  
Server IP: **5.161.178.63**  
Repo: **https://github.com/MoneyPackk/streamflow**

## First-time setup (on the server)

```bash
ssh root@5.161.178.63
curl -sL https://raw.githubusercontent.com/MoneyPackk/streamflow/master/deploy.sh | bash -s moneypack.wtf your@email.com
```

Edit `/opt/streamflow/.env` and set `TMDB_API_KEY` (TMDB v4 read token).

## Deploy updates (after every push to master)

```bash
ssh root@5.161.178.63
bash /opt/streamflow/scripts/deploy-update.sh
```

Or one-liner from your machine:

```bash
ssh root@5.161.178.63 'bash /opt/streamflow/scripts/deploy-update.sh'
```

## Verify

```bash
curl https://moneypack.wtf/api/health
npm run monitor
```

## Required `.env` keys

| Key | Required |
|-----|----------|
| `JWT_SECRET` | Yes |
| `TMDB_API_KEY` | Yes |
| `PORT` | Optional (default 3000) |
| `ALLOWED_ORIGINS` | Optional |
| `RD_API_KEY` | Optional (Real-Debrid streams) |
