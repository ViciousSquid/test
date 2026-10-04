# Leekworks Tycoon

A tiny browser-first factory tycoon inspired by the automation/building loop of classic factory games.

## Play

Open `index.html` in a browser. No build step or dependencies are required.

The production chain is:

`Leek Patch -> Cutter -> Cooker -> Packer -> Market`

Belts move material between machines. Sell packaged leek meals to earn cash and unlock the later machines.

### Controls

- Click a build button or press **1–7**.
- Press **R** to rotate the selected building/belt before placing it.
- **Esc** cancels the build tool.
- **Space** pauses/resumes the simulation.
- **Right click** removes a building or belt.
- Place belts as a directed path between machines.

## Design goal

This is intentionally a compact prototype rather than a framework-heavy game. The simulation is deterministic and runs entirely in the browser, making the repository easy to fork and host with GitHub Pages.
