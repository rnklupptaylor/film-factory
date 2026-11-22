# Film Factory

Film Factory is an interactive guide to thin-film deposition. Open **The Atom Shop (PVD)** from the start menu to explore evaporation, sputtering and ion plating in an interactive chamber. **The Reaction Room (CVD)** is the placeholder for chemical vapour deposition.

| Branch | Cloudflare address |
| --- | --- |
| `main` · Public release | https://film-factory.ipt-apps.workers.dev |
| `dev` · Development | https://dev-film-factory.ipt-apps.workers.dev |

## In The Atom Shop

- **Evaporation** includes direct and indirect resistance heating, electron beam heating and radiation heating. Vary source temperature, pressure, distance and substrate temperature.
- **Sputtering** offers DC diode, DC magnetron, Pulsed DC magnetron and RF at 13.56 MHz. The two DC magnetron methods show optional O₂ for Al and N₂ for Ti. In Pulsed DC magnetron, select an ITO ceramic or In–Sn alloy target to explore the two ITO routes. The chamber shows the magnet poles and magnetic field B for the magnetron methods.
- **Supply mode** in DC sputtering lets students set power, voltage or current and see the estimated electrical operating point and ion bombardment. Pulsed DC distinguishes on-state and average values. Independent **Ion settings** remain available and are used for RF and the ITO target recipes. The Stocker can compare centre deposition per joule at the final recipe settings. Theory documents the experimental anchors and model limits.
- **Arcing** shows relative risk for DC and pulsed DC magnetron sputtering. With an Al target, vary oxygen to explore oxide formation and then vary duty and frequency to see the effect of pulse reversal. Growth displays localised target flashes at an illustrative cadence. Theory explains the measured trends and model assumptions.
- **Ion plating** includes classic plasma-based plating, cathodic arc ion plating of TiN in N₂ and ion beam assisted deposition. Brightened neutral trajectories illustrate source-to-substrate transport in classic ion plating and IBAD. Use **Pre-clean** in classic ion plating to turn off the coating source while Ar⁺ removes modelled surface residue. Switch to **Deposit** to grow a film on the prepared substrate.
- **Preview** projects the result from a bare substrate at the current settings over 5–180 seconds, with a default of 60 seconds. **Growth** lets you run, pause and reset a 60-second simulation. Returning from Preview restores the paused run.
- **Film and diagnostics** includes the source response, centre thickness over time, the 100 mm wafer profile and a rotatable 3D morphology. The SEM-style view uses coarse stochastic deposition, shadowing, surface hops and resputtering. The surface grid gives a modelled areal RMS roughness estimate.
- **Lightbox** renders the full sample under studio or raking light. Switch to a light background to inspect a transparent coating on glass. Drag to rotate and use a scroll wheel or pinch to zoom. Roughness, coverage, porosity and the radial thickness profile drive the illustrated finish.
- **Zone model** marks the current conditions on a Movchan–Demchishin or Thornton schematic, an Anders projection, or a material-specific comparison. Model notes give the sources, the substrate context and the limits of each comparison.
- **Grains** colours the simulated grain identities in the Morphology tab. The readout shows exposed grain count and median apparent diameter in grid cells. Amorphous films retain a neutral tint.
- **Chamber** shows free flights, collisions and ion impacts during Growth. Use **Labels** to toggle the callouts. Particle paths remain visible with reduced motion enabled, which suppresses arc flashes. Gas-fed recipes open their feed before the process starts and keep it open during the run, with the pump connected. The chamber goes dark when a run pauses or finishes. Flight, fill and cooldown times are scaled for viewing.
- **Sensors** include a 6 MHz QCM with Sauerbrey frequency shift, tooling factor and wafer comparison, a pressure gauge, a holder thermocouple, modelled gas partial pressures and a relative Ti optical emission signal for reactive sputtering.
- **Substrates** include silicon, two glasses, stainless steel, polycarbonate and polyimide. The chamber shows the selected substrate mounted beneath a separately heated platen with a thermocouple. A warning identifies the thermal reference and links to the data.

The Theory page introduces the deposition methods, explains the plots and instruments, and links to the scientific literature and material data. Expand the model details to find equations and assumptions. The rates are reduced-order teaching estimates. The morphology drawings illustrate trends.

## Wafer stocker

Use **Add to Stocker** for any Preview or once a Growth run completes. The stocker keeps the recipe, recorded process changes, and film results in this browser. Its sortable columns distinguish technique, subtechnique and method. Double-click a row or choose **Inspect wafer** to reopen its Film & Diagnostics. The inspector can load the final saved recipe into a fresh PVD case.

Use the checkboxes, Ctrl-click, Shift-click, or **Select all** to compare samples. The comparison covers thickness profiles, growth and cleaning traces, process conditions, QCM, zone-model operating points, and morphology. Operating points share axes when they use the same diagram. SEM and Grains share a camera and grid scale across groups of up to four wafers. The Lightbox also compares up to four wafers at once with linked viewing controls. Use **Save selected** to download a titled JSON collection and **Reload saved wafers** to import it.

The **Graphs** tab plots one point per wafer. Choose any available process setting, film measurement, sensor reading, or morphology statistic for either axis. Working pressure uses a logarithmic scale. The table shows both values and identifies readings that do not apply to a wafer.

## Build and test

Use Node.js 20 or later. No dependencies to install.

```text
npm run build
npm test
```

Open `build/deploy/index.html` in a browser. The generated page is self-contained and works offline. Sources are in `src/`, the build is in `tools/` and checks are in `tests/`. The mode menu lives in `src/index.html`, with PVD content, calculations, graphics and controls in their own modules.

Cloudflare Workers Builds runs `npm run build`, publishes with `npx wrangler deploy`, and uses `npx wrangler preview` for preview builds. The production branch is `main`. Develop on `dev`, verify the preview and merge for release. The footer uses `teachingVersion` from `package.json`.

MIT licence. Concept by Prof. Robin N. Klupp Taylor. Developed with Codex.
