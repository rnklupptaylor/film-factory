# Film Factory

Film Factory is a teaching app on thin film processing at FAU Erlangen-Nürnberg. Open **The Atom Shop (PVD)** from the start menu to explore evaporation, sputtering and ion plating in an interactive chamber.

| Branch | Cloudflare address |
| --- | --- |
| `main` · Student release | https://film-factory.ipt-apps.workers.dev |
| `dev` · Development | https://dev-film-factory.ipt-apps.workers.dev |

## In The Atom Shop

- **Evaporation** includes direct and indirect resistance heating, electron beam heating and radiation heating. Vary source temperature, pressure, distance and substrate temperature.
- **Sputtering** opens with conventional DC diode sputtering. Compare it with DC, pulsed DC, RF at 13.56 MHz and reactive Ti magnetrons. The chamber shows the magnet poles and magnetic field B for the magnetron methods.
- **Ion plating** includes classic plasma-based plating, arc ion plating of TiN and ion beam assisted deposition. Use **Pre-clean** in classic ion plating to turn off the coating source while Ar⁺ removes modelled surface residue. Switch to **Deposit** to grow a film on the prepared substrate.
- **Film and plots** show growth history, the thickness profile across a 100 mm wafer, the source response and a rotatable 3D morphology. The SEM-style view uses coarse stochastic deposition, shadowing, surface hops and resputtering. Preview projects 60 seconds at the current settings. This run follows the recorded settings history. The surface grid gives a modelled areal RMS roughness estimate.
- **Chamber** shows free flights, collisions and ion impacts with labelled supplies and electrodes. Gas-fed recipes open their feed before the process starts and keep it open during the run, with the pump connected. The gas, plasma and source heat fade when a run pauses or finishes. Flight, fill and cooldown times are scaled for viewing.
- **Sensors** include a 6 MHz QCM with Sauerbrey frequency shift, tooling factor and wafer comparison, a pressure gauge, a holder thermocouple, modelled gas partial pressures and a relative Ti optical emission signal for reactive sputtering.
- **Substrates** include silicon, two glasses, stainless steel, polycarbonate and polyimide. The chamber shows the selected substrate mounted beneath a separately heated platen with a thermocouple. A warning identifies the thermal reference and links to the data.

The in-app Theory pages document the lecture references, the literature and material data, and modelling assumptions. The rates are reduced-order teaching estimates. The morphology drawings illustrate trends.

## Build and test

Use Node.js 20 or later. No dependencies to install.

```text
npm run build
npm test
```

Open `build/deploy/index.html` in a browser. The generated page is self-contained and works offline. Sources are in `src/`, the build is in `tools/` and checks are in `tests/`. The mode menu lives in `src/index.html`, with PVD content, calculations, graphics and controls in their own modules.

Cloudflare Workers Builds runs `npm run build`, publishes with `npx wrangler deploy`, and uses `npx wrangler preview` for preview builds. The production branch is `main`. Develop on `dev`, verify the preview and merge for release. The footer uses `teachingVersion` from `package.json`.

MIT licence. Course and concept by Prof. Robin N. Klupp Taylor, FAU Erlangen-Nürnberg. Developed with Codex.
