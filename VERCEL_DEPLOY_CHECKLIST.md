# Vercel + Neon Deploy Checklist

Use this when the frontend loads but API requests fail.

## Vercel Project Settings

Deploy from the repository root, not from `client`.

- Root Directory: leave blank, or set to the repository root.
- Build Command: `npm run build`
- Output Directory: `client/build`
- Install Command: leave default.

Vercel Functions are created from the root `api/` directory. If the Vercel project root is `client`, the backend will not deploy and `/api/health` will return the React app or 404.

## Environment Variables

Set these in Vercel for Production, Preview, and Development as needed:

```env
DATABASE_URL=your_neon_connection_string
JWT_SECRET=your_long_random_secret
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
REACT_APP_API_URL=
REACT_APP_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:your-turn-host:3478","turn:your-turn-host:443","turns:your-turn-host:443?transport=tcp"],"username":"your-turn-username","credential":"your-turn-password"}]
```

For a single Vercel project, `REACT_APP_API_URL` should be empty or removed. The frontend will call `/api/...` on the same domain.

`REACT_APP_ICE_SERVERS` must be valid JSON on one line. Replace the TURN host, username, and password with private credentials from your TURN provider, then redeploy the frontend so React bakes the value into the build.

## Smoke Tests

After redeploying, open:

```text
https://your-vercel-domain.vercel.app/api/health
```

Expected response:

```json
{"message":"Server is running"}
```

If you see the website HTML instead, the frontend fallback is catching API routes or the project was deployed from `client`.

If you see a 500 error, check Vercel Function logs for missing `JWT_SECRET`, invalid `DATABASE_URL`, or Neon connection errors.
