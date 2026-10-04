# Leekworks Tycoon

A tiny browser-first factory tycoon inspired by the automation/building loop of classic factory games.

## Play

Open `index.html` in a browser. No build step or dependencies are required.

The production chain is:

`Leek Patch -> Cutter -> Cooker -> Packer -> Market`

Belts are animated and each item visibly travels from tile to tile. Machines are recipe-driven: they accept one item and produce another with a higher sale value. The market can sell any delivered item, so you can expand the chain incrementally rather than waiting for one hard-coded product.

### Controls

- Click a build button or press **1–7**.
- Press **R** to rotate the selected building/belt before placing it.
- **Esc** cancels the build tool.
- **Space** pauses/resumes the simulation.
- **Right click** removes a building or belt.
- Place belts as a directed path between machines.

## Design goal

This is intentionally a compact prototype rather than a framework-heavy game. The simulation is deterministic and runs entirely in the browser, making the repository easy to fork and host with GitHub Pages.


## Factory model

The prototype now follows the physical-production pattern found in factory games: conveyors carry discrete items across the grid, machines have a directional input and output, and a recipe determines what an item becomes and what it is worth.

The research target is deliberately split:
- **Factorio:** directional belts, moving item entities, throughput/flow, and machines as explicit production stages.
- **Leek Factory Tycoon:** compact top-down factory layouts, recipes, visible conveyor production, upgrades, and an idle-tycoon value loop.

The game is not a clone of either game's art or UI.
