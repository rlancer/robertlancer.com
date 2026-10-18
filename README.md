# robertlancer.com

Landing page for [robertlancer.com](https://robertlancer.com).

Production is the `robertlancer` Worker on `robertlancer.com` and `www.robertlancer.com`. Staging is the `robertlancer-staging` Worker on `staging.robertlancer.com`. Deploys use the Cloudflare CLI (`cf`), not Wrangler.

## Deploy

Pushes to any branch except `main` deploy staging. `main` is protected: changes land through a pull request, and the merge deploys production.

```bash
npm ci
npm run dev
npm run deploy:staging
npm run deploy
```
