# Coat of Atoms

An interactive teaching app on physical vapour deposition for Thin Film Processing at FAU Erlangen-Nürnberg. Explore evaporation, sputtering and ion plating in a virtual coating chamber.

| Branch | Cloudflare address |
| --- | --- |
| `main` · Student release | https://coat-of-atoms.ipt-apps.workers.dev |
| `dev` · Development | https://dev-coat-of-atoms.ipt-apps.workers.dev |

Use Node.js 20 or later. Run `npm run build` and open `build/deploy/index.html` in a browser. Run `npm test` to check the build. The generated app is self-contained.

Sources are in `src/`, the build script is in `tools/` and checks are in `tests/`. Cloudflare Workers Builds runs `npm run build`, publishes with `npx wrangler deploy`, and uses `npx wrangler preview` for preview builds. The production branch is `main`.

MIT licence. Course and concept by Prof. Robin N. Klupp Taylor, FAU Erlangen-Nürnberg. Developed with Codex.
