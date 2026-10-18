import { defineConfig } from "cf/config";

const accountId = "3315bb3e7d2e3556bfea6fb3947a890e";

export default defineConfig(({ mode }) => {
  const staging = mode === "staging";

  return {
    accountId,
    worker: {
      name: staging ? "robertlancer-staging" : "robertlancer",
      compatibilityDate: "2026-10-18",
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "404-page",
      },
      domains: staging
        ? ["staging.robertlancer.com"]
        : ["robertlancer.com", "www.robertlancer.com"],
      workersDev: true,
    },
  };
});
