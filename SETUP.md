# StreamFlow Setup Guide

## Step 1: Register moneypack.is-a.dev

1. Go to https://github.com/is-a-dev/register
2. Click Fork (top-right)
3. In your fork, navigate to `domains/` folder
4. Click "Add file" → "Create new file"
5. Name it: `moneypack.json`
6. Paste this:
```json
{
  "owner": {
    "username": "moneypack"
  },
  "records": {
    "A": ["SERVER_IP_HERE"]
  },
  "proxied": true
}
```
7. Replace `SERVER_IP_HERE` with the Hetzner server IP (from Step 2)
8. Commit directly to main branch
9. Click "Contribute" → "Open Pull Request"
10. Wait for merge (~hours)

## Step 2: Get Hetzner Server

1. Go to https://hetzner.com/cloud
2. Sign up (email + verification)
3. Select **CPX11** ($4.40/mo):
   - 2 vCPU, 2 GB RAM, 40 GB SSD, 20 TB traffic
4. Choose location closest to your audience:
   - US East: Ashburn (ash)
   - US West: Hillsboro (hil)
   - Europe: Nuremberg (nbg) or Helsinki (hel)
5. Select **Ubuntu 24.04** as OS
6. Add your SSH key
7. Create server → note the IP address

## Step 3: Deploy

On your local machine, run:
```bash
ssh root@YOUR_SERVER_IP
```

Then paste this one-liner:
```bash
curl -sL https://raw.githubusercontent.com/moneypack/streamflow/main/deploy.sh | bash -s moneypack.is-a.dev admin@moneypack.is-a.dev
```

## Step 4: Update Domain

Once deployed, update `domains/moneypack.json` to:
```json
{
  "owner": {
    "username": "moneypack"
  },
  "records": {
    "A": ["YOUR_SERVER_IP"]
  },
  "proxied": true
}
```

## Step 5: First Use

1. Go to https://moneypack.is-a.dev
2. Register an account
3. Go to /upload
4. Upload an MP4 with title/genre
5. Stream plays via HLS
