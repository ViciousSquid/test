(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const moneyEl = document.getElementById("money");
  const revenueEl = document.getElementById("revenue");
  const goalEl = document.getElementById("goal");
  const dayEl = document.getElementById("day");
  const productionEl = document.getElementById("production");
  const selectionEl = document.getElementById("selection");
  const statusEl = document.getElementById("status");
  const buildMenu = document.getElementById("build-menu");
  const pauseButton = document.getElementById("pause");
  const resetButton = document.getElementById("reset");

  const TILE = 40;
  const COLS = 25;
  const ROWS = 17;
  const OFFSET_X = 10;
  const OFFSET_Y = 20;
  const GOAL = 10000;
  const DAY_LENGTH = 60;
  const BELT_SPEED = 1.8;
  const MAX_BELT_ITEMS = 2;

  const DIRS = [
    { x: 1, y: 0, angle: 0, name: "E" },
    { x: 0, y: 1, angle: Math.PI / 2, name: "S" },
    { x: -1, y: 0, angle: Math.PI, name: "W" },
    { x: 0, y: -1, angle: -Math.PI / 2, name: "N" }
  ];

  const ITEMS = {
    leek: { label: "Raw leek", glyph: "🥬", value: 5 },
    chopped: { label: "Chopped leek", glyph: "✂", value: 12 },
    stew: { label: "Leek stew", glyph: "🍲", value: 28 },
    box: { label: "Leek box", glyph: "📦", value: 65 },
    crate: { label: "Export crate", glyph: "🧰", value: 110 }
  };

  // Recipes are data, not hard-coded production logic.
  const RECIPES = {
    cutter: {
      key: "cutter",
      name: "Cutter",
      hotkey: "3",
      cost: 120,
      unlock: 0,
      input: "leek",
      output: "chopped",
      time: 1.5,
      capacity: 2,
      color: "#4d7fa7",
      glyph: "✂",
      desc: "Cuts raw leek into chopped leek"
    },
    cooker: {
      key: "cooker",
      name: "Cooker",
      hotkey: "4",
      cost: 180,
      unlock: 600,
      input: "chopped",
      output: "stew",
      time: 2.0,
      capacity: 2,
      color: "#b06a43",
      glyph: "🍲",
      desc: "Cooks chopped leek into stew"
    },
    packer: {
      key: "packer",
      name: "Packer",
      hotkey: "5",
      cost: 240,
      unlock: 1800,
      input: "stew",
      output: "box",
      time: 2.2,
      capacity: 2,
      color: "#a78b4c",
      glyph: "📦",
      desc: "Packs stew into valuable boxes"
    }
  };

  const BUILDINGS = {
    planter: {
      key: "planter", name: "Leek Patch", hotkey: "1", cost: 100, unlock: 0,
      desc: "Grows raw leeks", color: "#5b963b", glyph: "🥬", role: "producer",
      time: 2.5, output: "leek"
    },
    belt: {
      key: "belt", name: "Conveyor", hotkey: "2", cost: 10, unlock: 0,
      desc: "Moves two items directionally", color: "#69716c", glyph: "→", role: "belt"
    },
    cutter: RECIPES.cutter,
    cooker: RECIPES.cooker,
    packer: RECIPES.packer,
    market: {
      key: "market", name: "Restaurant", hotkey: "6", cost: 140, unlock: 0,
      desc: "Sells delivered products", color: "#8d4b71", glyph: "$", role: "seller"
    },
    battery: {
      key: "battery", name: "Booster", hotkey: "7", cost: 500, unlock: 4500,
      desc: "Makes every machine 15% faster", color: "#6e5aa6", glyph: "⚡", role: "upgrade"
    }
  };

  let state;
  let dragging = false;
  let lastDragCell = null;

  function freshState() {
    return {
      money: 500,
      revenue: 0,
      day: 1,
      elapsed: 0,
      paused: false,
      selectedTool: "belt",
      rotation: 0,
      hovered: null,
      selected: null,
      buildings: new Map(),
      stats: { leek: 0, chopped: 0, stew: 0, box: 0 },
      sold: 0,
      efficiency: 1,
      messages: []
    };
  }

  function key(x, y) {
    return y * COLS + x;
  }

  function addBuilding(type, x, y, dir = 0) {
    const def = BUILDINGS[type];
    state.buildings.set(key(x, y), {
      type,
      x,
      y,
      dir,
      progress: 0,
      input: [],
      output: null,
      items: []
    });

    if (def.role === "belt") {
      state.buildings.get(key(x, y)).items = [];
    }
  }

  function loadInitial() {
    state = freshState();
    addBuilding("planter", 3, 7, 0);
    addBuilding("market", 21, 7, 2);
    showMessage("Factory online. Build a straight production line and watch the boxes move.");
    updateBuildMenu();
  }

  function cellAt(x, y) {
    return state.buildings.get(key(x, y)) || null;
  }

  function inBounds(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  function worldToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const px = (clientX - rect.left) * sx;
    const py = (clientY - rect.top) * sy;
    const x = Math.floor((px - OFFSET_X) / TILE);
    const y = Math.floor((py - OFFSET_Y) / TILE);
    return inBounds(x, y) ? { x, y } : null;
  }

  function priceFor(type) {
    return BUILDINGS[type].cost;
  }

  function unlocked(type) {
    return state.revenue >= BUILDINGS[type].unlock;
  }

  function spend(cost) {
    if (state.money < cost) return false;
    state.money -= cost;
    return true;
  }

  function canPlace(type, x, y) {
    if (!BUILDINGS[type] || !inBounds(x, y) || cellAt(x, y)) return false;
    if (!unlocked(type)) return false;
    return state.money >= priceFor(type);
  }

  function opposite(dir) {
    return (dir + 2) % 4;
  }

  function adjacent(building, dir) {
    const d = DIRS[dir];
    return { x: building.x + d.x, y: building.y + d.y };
  }

  function tryPlace(type, x, y) {
    if (!BUILDINGS[type]) return false;

    if (!unlocked(type)) {
      showMessage(BUILDINGS[type].name + " unlocks at $" + BUILDINGS[type].unlock.toLocaleString() + " revenue.");
      return false;
    }

    if (!canPlace(type, x, y)) {
      showMessage("Can't build there.");
      return false;
    }

    const cost = priceFor(type);
    if (!spend(cost)) return false;

    addBuilding(type, x, y, state.rotation);
    state.selected = { x, y };
    showMessage("Built " + BUILDINGS[type].name + " for $" + cost + ".");
    updateBuildMenu();
    return true;
  }

  function removeAt(x, y) {
    const building = cellAt(x, y);
    if (!building) return;
    const refund = Math.floor(priceFor(building.type) * 0.55);
    state.buildings.delete(key(x, y));
    state.money += refund;
    state.selected = null;
    showMessage("Removed " + BUILDINGS[building.type].name + " — refund $" + refund + ".");
    updateBuildMenu();
  }

  function inputDirection(machine) {
    return opposite(machine.dir);
  }

  function outputDirection(machine) {
    return machine.dir;
  }

  function beltCanAccept(belt) {
    return belt && belt.type === "belt" && belt.items.length < MAX_BELT_ITEMS;
  }

  function beltStartClear(belt, lane) {
    return belt.items.every(item => item.lane !== lane || item.offset > 0.27);
  }

  function spawnBeltItem(belt, type, lane = 0) {
    if (!beltCanAccept(belt) || !beltStartClear(belt, lane)) return false;
    belt.items.push({ type, lane, offset: 0 });
    return true;
  }

  function outputBeltFor(building) {
    const p = adjacent(building, outputDirection(building));
    if (!inBounds(p.x, p.y)) return null;
    const target = cellAt(p.x, p.y);
    return target && target.type === "belt" ? target : null;
  }

  function inputBeltFor(building) {
    const p = adjacent(building, inputDirection(building));
    if (!inBounds(p.x, p.y)) return null;
    const target = cellAt(p.x, p.y);
    return target && target.type === "belt" ? target : null;
  }

  function deliverFromBelt(belt, item, machine) {
    const def = RECIPES[machine.type];
    if (!def || item.type !== def.input || machine.input.length >= def.capacity) {
      return false;
    }
    machine.input.push(item.type);
    state.stats[item.type]++;
    machine.progressPulse = 1;
    return true;
  }

  function sellItem(item) {
    const value = ITEMS[item].value;
    state.money += value;
    state.revenue += value;
    state.sold++;
    if (state.revenue < 250 || state.revenue % 500 < value) {
      showMessage("Restaurant sold " + ITEMS[item].label + " for $" + value + ".");
    }
  }

  function tryDeliverAtBeltEnd(belt, item) {
    const p = {
      x: belt.x + DIRS[belt.dir].x,
      y: belt.y + DIRS[belt.dir].y
    };

    if (!inBounds(p.x, p.y)) return false;
    const target = cellAt(p.x, p.y);
    if (!target) return false;

    if (target.type === "belt") {
      // Preserve directionality: only transfer into the next belt if its
      // entrance points along the current flow or it is perpendicular.
      if (!beltCanAccept(target)) return false;
      const transferLane = item.lane;
      if (!beltStartClear(target, transferLane)) return false;
      target.items.push({ type: item.type, lane: transferLane, offset: 0 });
      return true;
    }

    if (target.type === "market") {
      sellItem(item.type);
      return true;
    }

    if (RECIPES[target.type]) {
      const required = RECIPES[target.type];
      if (target.input.length >= required.capacity || required.input !== item.type) {
        return false;
      }
      // The belt must point into the machine's input side.
      if (inputDirection(target) !== opposite(belt.dir)) return false;
      return deliverFromBelt(belt, item, target);
    }

    return false;
  }

  function inputDirection(machine) {
    return opposite(machine.dir);
  }

  function updateBelts(dt) {
    const belts = [...state.buildings.values()].filter(b => b.type === "belt");

    for (const belt of belts) {
      for (const item of belt.items) {
        item.offset += dt * BELT_SPEED * state.efficiency;
      }
    }

    // One transfer per item per tick; a later belt can receive an item after
    // it has already advanced this frame, avoiding teleportation.
    for (const belt of belts) {
      for (let i = belt.items.length - 1; i >= 0; i--) {
        const item = belt.items[i];
        if (item.offset < 1) continue;

        if (tryDeliverAtBeltEnd(belt, item)) {
          belt.items.splice(i, 1);
        } else {
          item.offset = 0.999;
        }
      }

      belt.items.sort((a, b) => b.offset - a.offset);
    }
  }

  function updateMachines(dt) {
    for (const building of state.buildings.values()) {
      const def = RECIPES[building.type];
      if (!def) continue;

      if (building.output) {
        const belt = outputBeltFor(building);
        if (belt && spawnBeltItem(belt, building.output, 0)) {
          building.output = null;
          building.outputPulse = 1;
        }
        continue;
      }

      if (building.input.length === 0) {
        building.progress = Math.max(0, building.progress - dt * 0.6);
        continue;
      }

      building.progress += dt * state.efficiency;
      building.processPulse = Math.max(0, Math.sin(building.progress * 10) * 0.15);

      if (building.progress >= def.time) {
        building.progress -= def.time;
        building.input.shift();
        building.output = def.output;
        building.processPulse = 1;
        state.stats[def.output]++;
      }
    }
  }

  function updateProducers(dt) {
    for (const building of state.buildings.values()) {
      if (building.type !== "planter") continue;

      building.progress += dt * state.efficiency;
      if (building.progress < BUILDINGS.planter.time) continue;

      const p = adjacent(building, building.dir);
      if (!inBounds(p.x, p.y)) continue;
      const target = cellAt(p.x, p.y);
      if (!target || target.type !== "belt") continue;
      if (spawnBeltItem(target, "leek", 0)) {
        building.progress -= BUILDINGS.planter.time;
        building.outputPulse = 1;
      }
    }
  }

  function updateMarkets() {
    // Market intake is handled by belt endpoints. This is intentionally kept
    // as a separate stage so the simulation order mirrors production flow.
  }

  function recomputeEfficiency() {
    const boosters = [...state.buildings.values()].filter(b => b.type === "battery").length;
    state.efficiency = 1 + Math.min(0.6, boosters * 0.15);
  }

  function advance(dt) {
    if (state.paused) return;

    recomputeEfficiency();

    state.elapsed += dt;
    if (state.elapsed >= DAY_LENGTH) {
      state.elapsed -= DAY_LENGTH;
      state.day++;
      showMessage("Day " + state.day + ". The factory keeps running.");
    }

    for (const b of state.buildings.values()) {
      b.processPulse = Math.max(0, (b.processPulse || 0) - dt * 2);
      b.outputPulse = Math.max(0, (b.outputPulse || 0) - dt * 2);
      b.progressPulse = Math.max(0, (b.progressPulse || 0) - dt * 2);
    }

    updateBelts(dt);
    updateMachines(dt);
    updateProducers(dt);
    updateMarkets();
  }

  function drawWarehouseEnvironment() {
  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let x = 0; x < canvas.width; x += 160) {
    ctx.fillStyle = "#34443a"; ctx.fillRect(x, 0, 5, canvas.height);
    ctx.fillStyle = "#66746a"; ctx.fillRect(x + 5, 0, 2, canvas.height);
  }
  for (let y = 55; y < canvas.height; y += 120) {
    ctx.fillStyle = "#344139"; ctx.fillRect(0, y, canvas.width, 4);
  }
  for (let i = 0; i < 4; i++) {
    const x = 35 + i * 310;
    ctx.fillStyle = "#0b120e"; ctx.fillRect(x, 3, 90, 13);
    ctx.strokeStyle = "#758278"; ctx.strokeRect(x + .5, 3.5, 89, 12);
    for (let p = 0; p < 4; p++) {
      ctx.fillStyle = "#9b7748"; ctx.fillRect(x + 8 + p * 18, 6, 13, 7);
    }
  }
  ctx.restore();
}

function drawMachineGlow(b, color) {
  const x = OFFSET_X + b.x * TILE + TILE / 2;
  const y = OFFSET_Y + b.y * TILE + TILE / 2;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
  g.addColorStop(0, color + "40"); g.addColorStop(1, color + "00");
  ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
}

function drawBackground() {
    ctx.fillStyle = "#202620";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        const px = OFFSET_X + x * TILE;
        const py = OFFSET_Y + y * TILE;
        ctx.fillStyle = (x + y) % 2 ? "#252b26" : "#292f29";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = "#3c463e";
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  function drawArrow(cx, cy, dir, alpha = 1, length = 12) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[dir].angle);
    ctx.strokeStyle = "#e0e7df";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - 5, -5);
    ctx.moveTo(length, 0);
    ctx.lineTo(length - 5, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawPort(x, y, dir, color, active) {
    const d = DIRS[dir];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(d.angle);
    ctx.fillStyle = active ? color : "#0b100d";
    ctx.strokeStyle = active ? "#e9f6df" : "#607064";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-7, -5, 14, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBelt(b) {
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const phase = (performance.now() * 0.07) % 14;

    ctx.fillStyle = "#3b403c";
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 5, py + 5, TILE - 10, TILE - 10);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(DIRS[b.dir].angle);
    ctx.strokeStyle = "#aab4ad55";
    ctx.lineWidth = 2;

    for (const laneOffset of [-8, 8]) {
      for (let q = -30; q <= 30; q += 12) {
        const n = q + phase;
        ctx.beginPath();
        ctx.moveTo(n, laneOffset - 4);
        ctx.lineTo(n + 4, laneOffset + 4);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.strokeStyle = "#858d87";
    ctx.strokeRect(px + 4.5, py + 4.5, TILE - 9, TILE - 9);
    drawArrow(cx, cy, b.dir, .65, 8);

    for (const item of b.items) {
      const d = DIRS[b.dir];
      const t = Math.max(0, Math.min(1, item.offset));
      const distance = (t - 0.5) * (TILE - 12);
      const lane = item.lane === 0 ? -8 : 8;
      const perp = { x: -d.y, y: d.x };
      const itemX = cx + d.x * distance + perp.x * lane;
      const itemY = cy + d.y * distance + perp.y * lane;

      ctx.save();
      ctx.beginPath();
      ctx.arc(itemX, itemY, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#0b100d";
      ctx.fill();
      ctx.font = "15px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f5faef";
      ctx.fillText(ITEMS[item.type].glyph, itemX, itemY + 1);
      ctx.restore();
    }
  }

  function drawMachine(b) {
    const def = RECIPES[b.type];
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const working = b.input.length > 0 || b.output;

    ctx.fillStyle = def.color;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = working ? "#f1f3d0" : "#0a0f0b";
    ctx.lineWidth = working ? 2.5 : 2;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

    ctx.save();
    ctx.translate(cx, cy);
    if (b.processPulse) {
      ctx.rotate(Math.sin(performance.now() * 0.02) * 0.05 * b.processPulse);
    }
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(def.glyph, 0, -2);
    if (active) drawMachineGlow(b, def.color);
    ctx.restore();

    // Input / output ports make the recipe directional and visible.
    const input = adjacent(b, inputDirection(b));
    const output = adjacent(b, outputDirection(b));
    const inputCx = px + TILE / 2 + DIRS[inputDirection(b)].x * 16;
    const inputCy = py + TILE / 2 + DIRS[inputDirection(b)].y * 16;
    const outputCx = px + TILE / 2 + DIRS[outputDirection(b)].x * 16;
    const outputCy = py + TILE / 2 + DIRS[outputDirection(b)].y * 16;
    drawPort(inputCx, inputCy, inputDirection(b), "#65a6d7", b.input.length > 0);
    drawPort(outputCx, outputCy, outputDirection(b), "#f0c567", Boolean(b.output));

    ctx.fillStyle = "#0b100dcc";
    ctx.fillRect(px + 5, py + TILE - 9, TILE - 10, 4);
    ctx.fillStyle = b.output ? "#f0c567" : "#dbe7d5";
    const pct = Math.min(1, b.progress / def.time);
    ctx.fillRect(px + 5, py + TILE - 9, (TILE - 10) * pct, 4);

    if (b.input.length > 0) {
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#08100a";
      ctx.fillText(b.input.length + "/" + def.capacity, cx, py + 13);
    }
  }

  function drawProducer(b) {
    const def = BUILDINGS.planter;
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    ctx.fillStyle = def.color;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = b.outputPulse ? "#f1f3d0" : "#0a0f0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

    ctx.font = "19px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(def.glyph, cx, cy);

    const p = adjacent(b, b.dir);
    const target = inBounds(p.x, p.y) ? cellAt(p.x, p.y) : null;
    drawPort(
      px + TILE / 2 + DIRS[b.dir].x * 15,
      py + TILE / 2 + DIRS[b.dir].y * 15,
      b.dir,
      "#78bf63",
      Boolean(target && target.type === "belt")
    );

    ctx.fillStyle = "#0b100dcc";
    ctx.fillRect(px + 5, py + TILE - 9, TILE - 10, 4);
    ctx.fillStyle = "#dbe7d5";
    ctx.fillRect(px + 5, py + TILE - 9, (TILE - 10) * Math.min(1, b.progress / def.time), 4);
  }

  function drawMarket(b) {
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    ctx.fillStyle = BUILDINGS.market.color;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = "#0a0f0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText("$", cx, cy);

    ctx.font = "9px system-ui";
    ctx.fillStyle = "#f4e1f0";
    ctx.fillText("SELL", cx, py + 12);
  }

  function drawBooster(b) {
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    ctx.fillStyle = BUILDINGS.battery.color;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = "#dcd5fa";
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText("⚡", cx, cy);
  }

  function drawPreview() {
    if (!state.hovered || !state.selectedTool) return;
    const { x, y } = state.hovered;
    const px = OFFSET_X + x * TILE;
    const py = OFFSET_Y + y * TILE;
    const valid = canPlace(state.selectedTool, x, y);

    ctx.fillStyle = valid ? "#79c66d30" : "#da5b4a30";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = valid ? "#79c66d99" : "#da5b4a99";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);

    if (valid) {
      const def = BUILDINGS[state.selectedTool];
      ctx.fillStyle = def.color + "cc";
      ctx.fillRect(px + 7, py + 7, TILE - 14, TILE - 14);
      drawArrow(px + TILE / 2, py + TILE / 2, state.rotation, .75);
    }
  }

  function drawSelection() {
    if (!state.selected) return;
    const { x, y } = state.selected;
    const px = OFFSET_X + x * TILE;
    const py = OFFSET_Y + y * TILE;
    ctx.strokeStyle = "#f1f59a";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
  }

  function draw() {
    drawBackground();
    drawWarehouseEnvironment();

    for (const b of state.buildings.values()) {
      if (b.type === "belt") drawBelt(b);
    }

    for (const b of state.buildings.values()) {
      if (b.type === "planter") drawProducer(b);
      else if (RECIPES[b.type]) drawMachine(b);
      else if (b.type === "market") drawMarket(b);
      else if (b.type === "battery") drawBooster(b);
    }

    drawPreview();
    drawSelection();

    if (state.hovered) {
      const { x, y } = state.hovered;
      const px = OFFSET_X + x * TILE;
      const py = OFFSET_Y + y * TILE;
      ctx.strokeStyle = "#ffffff22";
      ctx.strokeRect(px, py, TILE, TILE);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#d6e5d0";
    ctx.fillText("LEEKWORKS // NORTH WAREHOUSE // " + (state.paused ? "PAUSED" : "RUNNING"), 18, 14);

    if (state.revenue >= GOAL) {
      ctx.fillStyle = "#ebef9f";
      ctx.font = "700 18px system-ui";
      ctx.fillText("THE GREAT LEEKINATION — FACTORY TYCOON COMPLETE", 18, 705);
    }
  }

  function setTool(type) {
    if (!BUILDINGS[type]) return;
    if (!unlocked(type)) {
      showMessage(BUILDINGS[type].name + " is locked.");
      return;
    }
    state.selectedTool = type;
    state.selected = null;
    updateBuildMenu();
  }

  function rotateTool() {
    state.rotation = (state.rotation + 1) % 4;
    showMessage("Building direction: " + DIRS[state.rotation].name + ".");
  }

  function buildDescription(def) {
    if (def.role === "producer") {
      return def.desc + " → $" + ITEMS[def.output].value;
    }
    if (def.role === "belt") return def.desc;
    if (def.role === "seller") return def.desc;
    if (def.role === "upgrade") return def.desc;
    return def.desc + " · " +
      ITEMS[def.input].glyph + " " + ITEMS[def.input].label +
      " → " + ITEMS[def.output].glyph + " " + ITEMS[def.output].label +
      " · $" + ITEMS[def.input].value + " → $" + ITEMS[def.output].value;
  }

  function updateBuildMenu() {
    buildMenu.innerHTML = "";

    Object.values(BUILDINGS).forEach(def => {
      const button = document.createElement("button");
      const isLocked = !unlocked(def.key);
      button.className = "build-button" +
        (state.selectedTool === def.key ? " active" : "") +
        (isLocked ? " locked" : "");

      let detail = buildDescription(def);
      if (isLocked) detail += " · unlock $" + def.unlock.toLocaleString();

      button.innerHTML =
        '<span class="build-icon" style="background:' + def.color + '">' + def.glyph + '</span>' +
        '<span><span class="build-name">' + def.hotkey + " · " + def.name + '</span>' +
        '<span class="build-desc">' + detail + '</span></span>' +
        '<span class="build-cost">$' + priceFor(def.key).toLocaleString() + '</span>';

      button.addEventListener("click", () => setTool(def.key));
      buildMenu.appendChild(button);
    });
  }

  function updatePanels() {
    moneyEl.textContent = "$" + Math.floor(state.money).toLocaleString();
    revenueEl.textContent = "$" + Math.floor(state.revenue).toLocaleString();
    goalEl.textContent = "$" + GOAL.toLocaleString();
    dayEl.textContent = String(state.day);
    pauseButton.textContent = state.paused ? "Resume" : "Pause";

    const counts = {};
    for (const b of state.buildings.values()) {
      counts[b.type] = (counts[b.type] || 0) + 1;
    }

    const machineRows = Object.values(RECIPES)
      .filter(r => counts[r.key])
      .map(r => counts[r.key] + "× " + r.name)
      .join(", ");

    productionEl.innerHTML =
      "🥬 Raw consumed: " + state.stats.leek + "<br>" +
      "✂ Chopped: " + state.stats.chopped + "<br>" +
      "🍲 Stew: " + state.stats.stew + "<br>" +
      "📦 Boxes: " + state.stats.box + "<br>" +
      "💵 Items sold: " + state.sold + "<br>" +
      "⚡ Factory speed: " + state.efficiency.toFixed(2) + "×<br>" +
      "🏭 Machines: " + (machineRows || "none");

    if (state.selected) {
      const b = cellAt(state.selected.x, state.selected.y);
      if (!b) {
        selectionEl.textContent = "Nothing selected";
        return;
      }

      if (RECIPES[b.type]) {
        const d = RECIPES[b.type];
        selectionEl.innerHTML =
          "<b>" + d.name + "</b><br>" +
          ITEMS[d.input].glyph + " " + ITEMS[d.input].label + " ($" + ITEMS[d.input].value + ")<br>" +
          "⏱ " + d.time.toFixed(1) + "s per item<br>" +
          "→ " + ITEMS[d.output].glyph + " " + ITEMS[d.output].label + " ($" + ITEMS[d.output].value + ")<br>" +
          "Buffer: " + b.input.length + "/" + d.capacity +
          (b.output ? "<br><b>Output waiting for belt</b>" : "");
      } else if (b.type === "belt") {
        selectionEl.innerHTML =
          "<b>Conveyor</b><br>" +
          "Direction: " + DIRS[b.dir].name + "<br>" +
          "Moving: " + b.items.length + "/" + MAX_BELT_ITEMS;
      } else {
        selectionEl.innerHTML =
          "<b>" + BUILDINGS[b.type].name + "</b><br>" +
          "Direction: " + DIRS[b.dir].name;
      }
    } else {
      selectionEl.innerHTML =
        "<b>Production is physical.</b><br>" +
        "Place belts between buildings. Items travel tile-by-tile; machines only consume matching inputs from their input side.";
    }
  }

  function showMessage(message) {
    state.messages.unshift(message);
    state.messages.length = 5;
    statusEl.textContent = message;
  }

  function placeDragCell(cell) {
    if (!cell) return;
    if (!lastDragCell || lastDragCell.x !== cell.x || lastDragCell.y !== cell.y) {
      tryPlace(state.selectedTool, cell.x, cell.y);
      lastDragCell = cell;
    }
  }

  canvas.addEventListener("mousemove", e => {
    const cell = worldToGrid(e.clientX, e.clientY);
    state.hovered = cell;

    if (dragging && state.selectedTool === "belt") {
      placeDragCell(cell);
    }
  });

  canvas.addEventListener("mouseleave", () => {
    state.hovered = null;
    dragging = false;
    lastDragCell = null;
  });

  canvas.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    const cell = worldToGrid(e.clientX, e.clientY);
    if (!cell) return;

    dragging = true;
    lastDragCell = null;

    if (state.selectedTool === "belt") {
      placeDragCell(cell);
    }
  });

  canvas.addEventListener("mouseup", e => {
    if (e.button !== 0) return;
    const cell = worldToGrid(e.clientX, e.clientY);
    if (!dragging) return;

    if (state.selectedTool !== "belt" && cell) {
      tryPlace(state.selectedTool, cell.x, cell.y);
    }

    dragging = false;
    lastDragCell = null;
  });

  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    const cell = worldToGrid(e.clientX, e.clientY);
    if (cell) removeAt(cell.x, cell.y);
  });

  window.addEventListener("keydown", e => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }

    if (e.key >= "1" && e.key <= "9") {
      const type = Object.values(BUILDINGS)[Number(e.key) - 1]?.key;
      if (type) setTool(type);
    } else if (e.key.toLowerCase() === "r") {
      rotateTool();
    } else if (e.key === "Escape") {
      state.selectedTool = null;
      state.selected = null;
      updateBuildMenu();
    } else if (e.code === "Space") {
      e.preventDefault();
      state.paused = !state.paused;
    }
  });

  pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
  });

  resetButton.addEventListener("click", () => {
    if (window.confirm("Reset the entire leek empire?")) loadInitial();
  });

  let previous = performance.now();
  let uiClock = 0;

  function loop(now) {
    const dt = Math.min(0.1, (now - previous) / 1000);
    previous = now;

    advance(dt);
    draw();

    uiClock += dt;
    if (uiClock >= 0.12) {
      uiClock = 0;
      updatePanels();
    }

    requestAnimationFrame(loop);
  }

  loadInitial();
  requestAnimationFrame(loop);
})();
