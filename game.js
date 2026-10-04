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

  const DIRS = [
    { x: 1, y: 0, angle: 0 },
    { x: 0, y: 1, angle: Math.PI / 2 },
    { x: -1, y: 0, angle: Math.PI },
    { x: 0, y: -1, angle: -Math.PI / 2 }
  ];

  const ITEM = {
    leek: { label: "Raw leek", glyph: "🥬" },
    chopped: { label: "Chopped leek", glyph: "✂" },
    stew: { label: "Leek stew", glyph: "🍲" },
    box: { label: "Leek box", glyph: "📦" }
  };

  const BUILDINGS = {
    planter: {
      key: "planter", name: "Leek Patch", hotkey: "1", cost: 100, unlock: 0,
      desc: "Grows raw leeks", color: "#5b963b", glyph: "🥬", role: "producer",
      rate: 2.6, output: "leek"
    },
    belt: {
      key: "belt", name: "Conveyor", hotkey: "2", cost: 10, unlock: 0,
      desc: "Moves items", color: "#7d8580", glyph: "→", role: "belt"
    },
    cutter: {
      key: "cutter", name: "Cutter", hotkey: "3", cost: 120, unlock: 250,
      desc: "Leek -> chopped", color: "#4d7fa7", glyph: "✂", role: "processor",
      input: "leek", output: "chopped", rate: 1.5, capacity: 2
    },
    cooker: {
      key: "cooker", name: "Cooker", hotkey: "4", cost: 180, unlock: 900,
      desc: "Chopped -> stew", color: "#b06a43", glyph: "🍲", role: "processor",
      input: "chopped", output: "stew", rate: 2.1, capacity: 2
    },
    packer: {
      key: "packer", name: "Packer", hotkey: "5", cost: 240, unlock: 2200,
      desc: "Stew -> boxes", color: "#a78b4c", glyph: "📦", role: "processor",
      input: "stew", output: "box", rate: 2.4, capacity: 2
    },
    market: {
      key: "market", name: "Market", hotkey: "6", cost: 140, unlock: 0,
      desc: "Sells leek boxes", color: "#8d4b71", glyph: "$", role: "seller",
      input: "box", sale: 65
    },
    battery: {
      key: "battery", name: "Accumulator", hotkey: "7", cost: 90, unlock: 5000,
      desc: "Factory efficiency", color: "#6e5aa6", glyph: "⚡", role: "upgrade"
    }
  };

  const INITIAL_BUILD = [
    ["planter", 3, 7, 0],
    ["market", 21, 7, 2]
  ];

  let state;

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
      processed: { leek: 0, chopped: 0, stew: 0, box: 0 },
      sold: 0,
      efficiency: 1,
      messages: ["Plant a cutter, then connect it to the market with belts."]
    };
  }

  function key(x, y) { return y * COLS + x; }

  function addBuilding(type, x, y, dir = 0) {
    state.buildings.set(key(x, y), {
      type,
      x,
      y,
      dir,
      progress: 0,
      input: 0,
      output: 0
    });
  }

  function loadInitial() {
    state = freshState();
    INITIAL_BUILD.forEach(([t, x, y, d]) => addBuilding(t, x, y, d));
    showMessage("Factory online. The leek economy awaits.");
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
    const b = BUILDINGS[type];
    const batteryPenalty = state.efficiency > 1 && type !== "battery" ? 1 : 1;
    return Math.ceil(b.cost * batteryPenalty);
  }

  function canPlace(type, x, y) {
    if (!inBounds(x, y) || cellAt(x, y)) return false;
    const b = BUILDINGS[type];
    if (!b) return false;
    if (state.money < priceFor(type)) return false;
    return state.money >= priceFor(type) && state.money >= 0;
  }

  function unlocked(type) {
    return state.revenue >= BUILDINGS[type].unlock;
  }

  function spend(cost) {
    if (state.money < cost) return false;
    state.money -= cost;
    return true;
  }

  function placeSelected(x, y) {
    const type = state.selectedTool;
    if (!BUILDINGS[type]) return;
    if (!unlocked(type)) {
      showMessage(BUILDINGS[type].name + " unlocks at $" + BUILDINGS[type].unlock.toLocaleString() + " revenue.");
      return;
    }
    if (!canPlace(type, x, y)) {
      showMessage("Can't build there. Check the tile and your cash.");
      return;
    }
    const cost = priceFor(type);
    if (!spend(cost)) return;
    addBuilding(type, x, y, state.rotation);
    state.selected = { x, y };
    showMessage("Built " + BUILDINGS[type].name + " for $" + cost + ".");
    updateBuildMenu();
  }

  function removeAt(x, y) {
    const item = cellAt(x, y);
    if (!item) return;
    state.buildings.delete(key(x, y));
    const refund = Math.floor(priceFor(item.type) * 0.55);
    state.money += refund;
    state.selected = null;
    showMessage("Removed " + BUILDINGS[item.type].name + ". Refunded $" + refund + ".");
    updateBuildMenu();
  }

  function neighbor(building) {
    const d = DIRS[building.dir];
    return { x: building.x + d.x, y: building.y + d.y };
  }

  function inputSources(building) {
    const sources = [];
    for (let i = 0; i < 4; i++) {
      const d = DIRS[i];
      const b = cellAt(building.x + d.x, building.y + d.y);
      if (b && b.type === "belt" && b.item) {
        sources.push(b);
      }
    }
    return sources;
  }

  function pullInput(building, wanted) {
    const sources = inputSources(building);
    for (const source of sources) {
      if (source.item !== wanted) continue;
      source.item = null;
      building.input++;
      state.processed[wanted]++;
      return true;
    }
    return false;
  }

  function pushOutput(building, item) {
    const p = neighbor(building);
    if (!inBounds(p.x, p.y)) return false;
    const target = cellAt(p.x, p.y);
    if (!target) return false;
    if (target.type === "belt" && !target.item) {
      target.item = item;
      return true;
    }
    if (target.type === "market" && item === "box") {
      sellBox(target);
      return true;
    }
    return false;
  }

  function beltTarget(belt) {
    const d = DIRS[belt.dir];
    return { x: belt.x + d.x, y: belt.y + d.y };
  }

  function updateBelts() {
    const belts = [...state.buildings.values()].filter(b => b.type === "belt" && b.item);
    for (const belt of belts) {
      if (!belt.item) continue;
      const p = beltTarget(belt);
      if (!inBounds(p.x, p.y)) continue;
      const target = cellAt(p.x, p.y);
      if (!target) continue;
      if (target.type === "belt" && !target.item) {
        target.item = belt.item;
        belt.item = null;
      } else if (target.type === "market" && belt.item === "box") {
        belt.item = null;
        sellBox(target);
      }
    }
  }

  function sellBox(market) {
    state.money += market.sale;
    state.revenue += market.sale;
    state.sold++;
    if (state.revenue === 65 || state.revenue % 1000 < 65) {
      showMessage("Sold a leek box for $" + market.sale + ".");
    }
    checkVictory();
  }

  function updateBuildings(dt) {
    const buildings = [...state.buildings.values()];
    for (const b of buildings) {
      const def = BUILDINGS[b.type];
      if (b.type === "planter") {
        b.progress += dt * state.efficiency;
        if (b.progress >= def.rate) {
          const out = neighbor(b);
          const target = inBounds(out.x, out.y) ? cellAt(out.x, out.y) : null;
          if (target && target.type === "belt" && !target.item) {
            target.item = "leek";
            b.progress -= def.rate;
          }
        }
      } else if (def.role === "processor") {
        while (b.input < def.capacity && pullInput(b, def.input)) {}
        if (b.input > 0) {
          b.progress += dt * state.efficiency;
          if (b.progress >= def.rate) {
            if (pushOutput(b, def.output)) {
              b.input--;
              b.progress -= def.rate;
            }
          }
        } else {
          b.progress = Math.max(0, b.progress - dt * 0.5);
        }
      } else if (def.role === "seller") {
        while (true) {
          const sources = inputSources(b);
          const source = sources.find(s => s.item === def.input);
          if (!source) break;
          source.item = null;
          sellBox(b);
        }
      }
    }
  }

  function recomputeEfficiency() {
    const batteries = [...state.buildings.values()].filter(b => b.type === "battery").length;
    state.efficiency = 1 + Math.min(0.4, batteries * 0.12);
  }

  function advance(dt) {
    if (state.paused) return;
    recomputeEfficiency();
    state.elapsed += dt;
    if (state.elapsed >= DAY_LENGTH) {
      state.elapsed -= DAY_LENGTH;
      state.day++;
      showMessage("Day " + state.day + ". The leek market remains open.");
    }
    // Move first, then consume/produce, so each tick advances the factory one step.
    updateBelts();
    updateBuildings(dt);
  }

  function drawBackground() {
    ctx.fillStyle = "#122017";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#18251b";
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        const px = OFFSET_X + x * TILE;
        const py = OFFSET_Y + y * TILE;
        ctx.fillStyle = (x + y) % 2 ? "#172219" : "#19251b";
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = "#233126";
        ctx.strokeRect(px + .5, py + .5, TILE - 1, TILE - 1);
      }
    }
  }

  function drawArrow(cx, cy, dir, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(DIRS[dir].angle);
    ctx.strokeStyle = "#d9ded8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.lineTo(4, -6);
    ctx.moveTo(10, 0);
    ctx.lineTo(4, 6);
    ctx.stroke();
    ctx.restore();
  }

  function drawBuilding(b) {
    const def = BUILDINGS[b.type];
    const px = OFFSET_X + b.x * TILE;
    const py = OFFSET_Y + b.y * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    ctx.fillStyle = def.color;
    ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
    ctx.strokeStyle = "#0a0f0b";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);

    ctx.font = "19px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(def.glyph, cx, cy - 3);

    if (b.type === "belt") {
      ctx.fillStyle = "#59625d";
      ctx.fillRect(px + 6, py + 13, TILE - 12, 14);
      drawArrow(cx, cy, b.dir, .9);
      if (b.item) {
        ctx.font = "18px sans-serif";
        ctx.fillText(ITEM[b.item].glyph, cx, cy);
      }
    } else {
      drawArrow(cx, cy + 13, b.dir, .4);
      if (def.role === "processor") {
        const pct = Math.min(1, b.input / def.capacity);
        ctx.fillStyle = "#0a0f0bcc";
        ctx.fillRect(px + 6, py + TILE - 9, TILE - 12, 4);
        ctx.fillStyle = "#e8f2d7";
        ctx.fillRect(px + 6, py + TILE - 9, (TILE - 12) * pct, 4);
      }
    }

    if (state.selected && state.selected.x === b.x && state.selected.y === b.y) {
      ctx.strokeStyle = "#f1f59a";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
    }
  }

  function drawPreview() {
    if (!state.hovered || !BUILDINGS[state.selectedTool]) return;
    const { x, y } = state.hovered;
    const valid = canPlace(state.selectedTool, x, y) && unlocked(state.selectedTool);
    const px = OFFSET_X + x * TILE;
    const py = OFFSET_Y + y * TILE;
    ctx.fillStyle = valid ? "#79c66d2c" : "#da5b4a2c";
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = valid ? "#79c66d88" : "#da5b4a88";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
    if (valid) {
      const def = BUILDINGS[state.selectedTool];
      ctx.fillStyle = def.color + "bb";
      ctx.fillRect(px + 7, py + 7, TILE - 14, TILE - 14);
      drawArrow(px + TILE / 2, py + TILE / 2, state.rotation, .7);
    }
  }

  function drawFactoryLines() {
    const sources = [...state.buildings.values()].filter(b => b.type !== "belt");
    for (const b of sources) {
      const out = neighbor(b);
      if (!inBounds(out.x, out.y)) continue;
      const target = cellAt(out.x, out.y);
      if (!target) continue;
      if (b.type === "planter" || BUILDINGS[b.type].role === "processor") {
        const x1 = OFFSET_X + b.x * TILE + TILE / 2;
        const y1 = OFFSET_Y + b.y * TILE + TILE / 2;
        const x2 = OFFSET_X + out.x * TILE + TILE / 2;
        const y2 = OFFSET_Y + out.y * TILE + TILE / 2;
        ctx.strokeStyle = "#e8f3cf30";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function draw() {
    drawBackground();
    drawFactoryLines();
    for (const b of state.buildings.values()) drawBuilding(b);
    drawPreview();

    if (state.hovered) {
      const { x, y } = state.hovered;
      const px = OFFSET_X + x * TILE;
      const py = OFFSET_Y + y * TILE;
      ctx.strokeStyle = "#ffffff22";
      ctx.strokeRect(px, py, TILE, TILE);
    }

    // Legend and unlock banner in the world.
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#d6e5d0";
    ctx.font = "12px system-ui";
    ctx.fillText("LEEKWORKS // " + (state.paused ? "PAUSED" : "LIVE"), 18, 14);

    if (state.revenue >= GOAL) {
      ctx.fillStyle = "#ebef9f";
      ctx.font = "700 18px system-ui";
      ctx.fillText("FACTORY TYCOON COMPLETE — THE GREAT LEEKINATION", 18, 705);
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

  function updateBuildMenu() {
    buildMenu.innerHTML = "";
    Object.values(BUILDINGS).forEach(def => {
      const button = document.createElement("button");
      button.className = "build-button" +
        (state.selectedTool === def.key ? " active" : "") +
        (!unlocked(def.key) ? " locked" : "");
      const cost = priceFor(def.key);
      button.innerHTML =
        '<span class="build-icon" style="background:' + def.color + '">' + def.glyph + '</span>' +
        '<span><span class="build-name">' + def.hotkey + " · " + def.name + '</span>' +
        '<span class="build-desc">' + def.desc + (!unlocked(def.key) ? " · unlock $" + def.unlock.toLocaleString() : "") + '</span></span>' +
        '<span class="build-cost">$' + cost.toLocaleString() + '</span>';
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
    for (const b of state.buildings.values()) counts[b.type] = (counts[b.type] || 0) + 1;
    productionEl.innerHTML =
      "🥬 Raw consumed: " + state.processed.leek + "<br>" +
      "✂ Chopped: " + state.processed.chopped + "<br>" +
      "🍲 Stew consumed: " + state.processed.stew + "<br>" +
      "📦 Boxes sold: " + state.sold + "<br>" +
      "⚡ Efficiency: " + state.efficiency.toFixed(2) + "x<br>" +
      "⚙ Machines: " + [...new Set(Object.keys(counts))].map(k => (counts[k] + "× " + BUILDINGS[k].name)).join(", ");

    if (state.selected) {
      const b = cellAt(state.selected.x, state.selected.y);
      if (b) {
        const d = BUILDINGS[b.type];
        selectionEl.innerHTML =
          "<b>" + d.name + "</b><br>" +
          "Grid: " + b.x + ", " + b.y + "<br>" +
          "Facing: " + ["E", "S", "W", "N"][b.dir] + "<br>" +
          (d.role === "processor" ? "Input buffer: " + b.input + "/" + d.capacity : "Status: " + (d.role || "transport"));
      }
    } else {
      selectionEl.textContent = "Nothing selected";
    }
  }

  function showMessage(message) {
    state.messages.unshift(message);
    state.messages.length = Math.min(state.messages.length, 4);
    statusEl.textContent = message;
  }

  function checkVictory() {
    if (state.revenue >= GOAL && state.revenue - 65 < GOAL) {
      showMessage("You did it. Ten thousand dollars of leek commerce.");
    }
  }

  canvas.addEventListener("mousemove", e => {
    state.hovered = worldToGrid(e.clientX, e.clientY);
  });

  canvas.addEventListener("mouseleave", () => {
    state.hovered = null;
  });

  canvas.addEventListener("click", e => {
    const cell = worldToGrid(e.clientX, e.clientY);
    if (!cell) return;
    if (state.selectedTool === "belt" || state.selectedTool) {
      placeSelected(cell.x, cell.y);
    }
  });

  canvas.addEventListener("contextmenu", e => {
    e.preventDefault();
    const cell = worldToGrid(e.clientX, e.clientY);
    if (cell) removeAt(cell.x, cell.y);
  });

  window.addEventListener("keydown", e => {
    if (e.key >= "1" && e.key <= "7") {
      const type = Object.values(BUILDINGS)[Number(e.key) - 1]?.key;
      if (type) setTool(type);
    } else if (e.key.toLowerCase() === "r") {
      state.rotation = (state.rotation + 1) % 4;
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
    const dt = Math.min(0.25, (now - previous) / 1000);
    previous = now;
    advance(dt);
    draw();
    uiClock += dt;
    if (uiClock >= 0.1) {
      uiClock = 0;
      updatePanels();
    }
    requestAnimationFrame(loop);
  }

  loadInitial();
  requestAnimationFrame(loop);
})();
