const modeLabels = {
  inspect: "模式：選擇節點",
  node: "模式：點擊空白處新增節點",
  edge: "模式：依序點兩個節點連接道路",
};

const typeLabels = {
  depot: "配送中心",
  delivery: "送貨點",
  pickup: "取貨點",
};

const typeIcons = {
  depot: "⌂",
  delivery: "□",
  pickup: "↑",
};

const state = {
  mode: "inspect",
  startNodeId: 1,
  selectedNodeId: 1,
  editingVehicleId: null,
  pendingEdgeNodeId: null,
  optimized: false,
  runtimeMs: null,
  totalTime: null,
  activeVehicleId: 1,
  vehicles: [
    { id: 1, name: "車輛 #1", capacity: 40 },
    { id: 2, name: "車輛 #2", capacity: 40 },
    { id: 3, name: "車輛 #3", capacity: 40 },
  ],
  nodes: [
    { id: 1, name: "配送中心", type: "depot", x: 165, y: 140, amount: 0, selected: false },
    { id: 2, name: "北區站點", type: "delivery", x: 365, y: 95, amount: 10, selected: false },
    { id: 3, name: "商辦取貨", type: "pickup", x: 655, y: 155, amount: 10, selected: true },
    { id: 4, name: "南區社區", type: "delivery", x: 260, y: 330, amount: 6, selected: true },
    { id: 5, name: "市集取貨", type: "pickup", x: 470, y: 285, amount: 8, selected: false },
    { id: 6, name: "西城宅配", type: "delivery", x: 365, y: 505, amount: 14, selected: true },
    { id: 7, name: "港口取貨", type: "pickup", x: 720, y: 410, amount: 8, selected: true },
  ],
  edges: [
    { from: 1, to: 2, weight: 5 },
    { from: 2, to: 3, weight: 9 },
    { from: 1, to: 4, weight: 4 },
    { from: 4, to: 5, weight: 6 },
    { from: 5, to: 3, weight: 7 },
    { from: 5, to: 7, weight: 6 },
    { from: 4, to: 6, weight: 8 },
    { from: 6, to: 7, weight: 10 },
    { from: 1, to: 6, weight: 12 },
  ],
  assignments: {},
  schedules: {},
  routes: {},
  vehicleTimes: {},
};

const els = {
  edgeLayer: document.querySelector("#edgeLayer"),
  weightLayer: document.querySelector("#weightLayer"),
  routeLayer: document.querySelector("#routeLayer"),
  nodeLayer: document.querySelector("#nodeLayer"),
  graphMap: document.querySelector("#graphMap"),
  startNode: document.querySelector("#startNode"),
  fleetList: document.querySelector("#fleetList"),
  fleetCount: document.querySelector("#fleetCount"),
  fleetForm: document.querySelector("#fleetForm"),
  vehicleCode: document.querySelector("#vehicleCode"),
  vehicleCapacity: document.querySelector("#vehicleCapacity"),
  taskList: document.querySelector("#taskList"),
  selectedCount: document.querySelector("#selectedCount"),
  selectedNodeLabel: document.querySelector("#selectedNodeLabel"),
  nodeType: document.querySelector("#nodeType"),
  taskAmount: document.querySelector("#taskAmount"),
  includeTask: document.querySelector("#includeTask"),
  deleteNodeBtn: document.querySelector("#deleteNodeBtn"),
  fleetTabs: document.querySelector("#fleetTabs"),
  timelinePanels: document.querySelector("#timelinePanels"),
  runtimeValue: document.querySelector("#runtimeValue"),
  totalTimeValue: document.querySelector("#totalTimeValue"),
  statusDot: document.querySelector("#statusDot"),
  modeLabel: document.querySelector("#modeLabel"),
  uploadName: document.querySelector("#uploadName"),
  toast: document.querySelector("#toastMessage"),
  runButton: document.querySelector("#runOptimization"),
};

function nodeById(id) {
  return state.nodes.find((node) => node.id === Number(id));
}

function vehicleById(id) {
  return state.vehicles.find((vehicle) => vehicle.id === Number(id));
}

function vehicleLabel(id) {
  const vehicle = vehicleById(id);
  return vehicle?.name || `車輛 #${id}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function edgeWeight(from, to) {
  const edge = state.edges.find(
    (item) => (item.from === from && item.to === to) || (item.from === to && item.to === from)
  );
  return edge ? edge.weight : Math.round(distance(nodeById(from), nodeById(to)) / 45);
}

function shortestPathNodes(from, to) {
  const source = Number(from);
  const target = Number(to);
  const distances = new Map(state.nodes.map((node) => [node.id, Infinity]));
  const previous = new Map();
  const queue = [{ id: source, distance: 0 }];
  distances.set(source, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (!current || current.distance > distances.get(current.id)) continue;
    if (current.id === target) break;

    state.edges.forEach((edge) => {
      let neighbor = null;
      if (Number(edge.from) === current.id) neighbor = Number(edge.to);
      if (Number(edge.to) === current.id) neighbor = Number(edge.from);
      if (neighbor === null) return;

      const candidate = current.distance + Number(edge.weight);
      if (candidate < distances.get(neighbor)) {
        distances.set(neighbor, candidate);
        previous.set(neighbor, current.id);
        queue.push({ id: neighbor, distance: candidate });
      }
    });
  }

  if (!Number.isFinite(distances.get(target))) return [source, target];

  const path = [target];
  let cursor = target;
  while (cursor !== source) {
    cursor = previous.get(cursor);
    if (cursor === undefined) return [source, target];
    path.unshift(cursor);
  }
  return path;
}

function expandRouteToMapPath(route) {
  if (route.length <= 1) return route;
  const expanded = [];
  route.slice(0, -1).forEach((nodeId, index) => {
    const segment = shortestPathNodes(nodeId, route[index + 1]);
    if (index === 0) {
      expanded.push(...segment);
    } else {
      expanded.push(...segment.slice(1));
    }
  });
  return expanded;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clearOptimization() {
  state.optimized = false;
  state.runtimeMs = null;
  state.totalTime = null;
  state.assignments = {};
  state.schedules = {};
  state.routes = {};
  state.vehicleTimes = {};
  els.statusDot.classList.remove("active");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function render() {
  renderStartOptions();
  renderFleet();
  renderGraph();
  renderTasks();
  renderNodeInspector();
  renderSchedule();
}

function renderStartOptions() {
  els.startNode.innerHTML = state.nodes
    .map((node) => `<option value="${node.id}">${node.id} - ${node.name}</option>`)
    .join("");
  els.startNode.value = String(state.startNodeId);
}

function renderFleet() {
  els.fleetCount.textContent = `${state.vehicles.length} vehicles`;
  els.fleetList.innerHTML = state.vehicles
    .map((vehicle) => {
      const name = vehicle.name || `車輛 #${vehicle.id}`;
      if (state.editingVehicleId === vehicle.id) {
        return `
          <article class="fleet-card editing" data-vehicle-id="${vehicle.id}">
            <div class="fleet-avatar">#${vehicle.id}</div>
            <div class="fleet-fields">
              <label>
                <span>車輛名稱</span>
                <input class="fleet-name-input" data-vehicle-id="${vehicle.id}" type="text" value="${escapeHtml(name)}" />
              </label>
              <label>
                <span>最大容量</span>
                <input class="fleet-capacity-input" data-vehicle-id="${vehicle.id}" type="number" value="${vehicle.capacity}" min="1" />
              </label>
              <div class="fleet-edit-actions">
                <button class="save-fleet-btn" data-vehicle-id="${vehicle.id}" type="button">保存</button>
                <button class="cancel-fleet-edit-btn" data-vehicle-id="${vehicle.id}" type="button">取消</button>
              </div>
            </div>
            <button class="delete-fleet-btn" data-vehicle-id="${vehicle.id}" title="刪除 ${escapeHtml(name)}" type="button">刪除</button>
          </article>
        `;
      }

      return `
        <article class="fleet-card" data-vehicle-id="${vehicle.id}" title="點擊編輯 ${escapeHtml(name)}">
          <div class="fleet-avatar">#${vehicle.id}</div>
          <div class="fleet-summary">
            <strong>${escapeHtml(name)}</strong>
            <small>最大容量: ${vehicle.capacity}</small>
          </div>
          <button class="delete-fleet-btn" data-vehicle-id="${vehicle.id}" title="刪除 ${escapeHtml(name)}" type="button">刪除</button>
        </article>
      `;
    })
    .join("");
  refreshVehicleCode();
}

function renderGraph() {
  els.edgeLayer.innerHTML = state.edges
    .map((edge) => {
      const from = nodeById(edge.from);
      const to = nodeById(edge.to);
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
    })
    .join("");

  els.weightLayer.innerHTML = state.edges
    .map((edge) => {
      const from = nodeById(edge.from);
      const to = nodeById(edge.to);
      return `<text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 8}">${edge.weight}</text>`;
    })
    .join("");

  els.nodeLayer.innerHTML = state.nodes
    .map((node) => {
      const classes = ["node", node.type];
      if (node.selected || node.id === state.startNodeId) classes.push("selected");
      if (node.id === state.selectedNodeId) classes.push("focused");
      if (node.id === state.pendingEdgeNodeId) classes.push("pending-edge");
      return `
        <g class="${classes.join(" ")}" data-node-id="${node.id}" transform="translate(${node.x} ${node.y})">
          <circle r="${node.type === "depot" ? 34 : 30}"></circle>
          <text class="node-icon" y="8">${typeIcons[node.type]}</text>
          <text class="node-label" y="58">${node.id} ${node.name}</text>
        </g>
      `;
    })
    .join("");

  renderRoutes();
}

function renderRoutes() {
  if (!state.optimized) {
    els.routeLayer.classList.remove("active");
    els.routeLayer.innerHTML = "";
    return;
  }

  const routePaths = Object.entries(state.routes)
    .filter(([, route]) => route.length > 1)
    .map(([vehicleId, route]) => {
      const expandedRoute = expandRouteToMapPath(route);
      const points = expandedRoute.map((id) => nodeById(id)).filter(Boolean);
      const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
      return `<path class="vehicle-route vehicle-route-${vehicleId}" d="${d}" marker-end="url(#arrow)"></path>`;
    })
    .join("");

  els.routeLayer.innerHTML = routePaths;
  els.routeLayer.classList.remove("active");
  void els.routeLayer.offsetWidth;
  els.routeLayer.classList.add("active");
}

function renderTasks() {
  const selectedNodes = state.nodes.filter((node) => node.selected && node.id !== state.startNodeId);
  els.selectedCount.textContent = `${selectedNodes.length} nodes`;

  if (selectedNodes.length === 0) {
    els.taskList.innerHTML = `<p class="empty-state">尚未加入配送目的地，請先選擇節點，再於右側設定勾選加入任務集合 D。</p>`;
    return;
  }

  els.taskList.innerHTML = selectedNodes
    .map((node) => {
      const vehicleId = state.assignments[node.id];
      const badge = state.optimized && vehicleId
        ? `<span class="assignment-badge vehicle-${((vehicleId - 1) % 3) + 1}">${vehicleLabel(vehicleId)} 負責</span>`
        : `<span class="assignment-badge pending">尚未分配</span>`;
      const amountPrefix = node.type === "delivery" ? "送貨量" : "取貨量";
      return `
        <article class="task-item ${node.type}" data-task-node-id="${node.id}">
          ${badge}
          <div>
            <strong>${node.id} ${node.name}</strong>
            <small>${typeLabels[node.type]} · ${amountPrefix} ${node.amount}</small>
          </div>
          <input class="form-check-input task-toggle" data-node-id="${node.id}" type="checkbox" checked />
        </article>
      `;
    })
    .join("");
}

function renderNodeInspector() {
  const node = nodeById(state.selectedNodeId);
  if (!node) return;
  els.selectedNodeLabel.textContent = `${node.id} ${node.name}`;
  els.nodeType.value = node.type;
  els.taskAmount.value = node.amount;
  els.includeTask.checked = node.selected;
  els.includeTask.disabled = node.id === state.startNodeId;
  els.deleteNodeBtn.disabled = node.id === state.startNodeId || state.nodes.length <= 1;
  els.deleteNodeBtn.textContent = node.id === state.startNodeId ? "起點不可刪除" : `刪除 ${node.id} ${node.name}`;
}

function renderSchedule() {
  els.runtimeValue.textContent = state.runtimeMs ? `${state.runtimeMs}ms` : "--";
  els.totalTimeValue.textContent = state.totalTime ? `${state.totalTime} min` : "--";

  if (!state.optimized) {
    els.fleetTabs.innerHTML = state.vehicles
      .map((vehicle, index) => `<button class="fleet-tab ${index === 0 ? "active" : ""}" data-vehicle-id="${vehicle.id}" type="button">${vehicle.name || `車輛 #${vehicle.id}`}</button>`)
      .join("");
    els.timelinePanels.innerHTML = `<p class="empty-state">按下 Run Optimization 後，這裡會顯示各車輛的配送時間軸與容量檢查。</p>`;
    return;
  }

  if (!state.vehicles.some((vehicle) => vehicle.id === state.activeVehicleId)) {
    state.activeVehicleId = state.vehicles[0]?.id ?? null;
  }

  els.fleetTabs.innerHTML = state.vehicles
    .map(
      (vehicle) => {
        const vehicleTime = state.vehicleTimes[vehicle.id] ?? 0;
        return `<button class="fleet-tab ${vehicle.id === state.activeVehicleId ? "active" : ""}" data-vehicle-id="${vehicle.id}" type="button">${vehicle.name || `車輛 #${vehicle.id}`}<small>${vehicleTime} min</small></button>`;
      }
    )
    .join("");

  els.timelinePanels.innerHTML = state.vehicles
    .map((vehicle) => {
      const schedule = state.schedules[vehicle.id] ?? [];
      const active = vehicle.id === state.activeVehicleId ? "active" : "";
      if (schedule.length === 0) {
        return `<div class="timeline-panel ${active}" data-panel-vehicle-id="${vehicle.id}"><p class="empty-state">${vehicle.name || `車輛 #${vehicle.id}`} 本次未分配任務。</p></div>`;
      }
      return `
        <div class="timeline-panel ${active}" data-panel-vehicle-id="${vehicle.id}">
          <ol class="timeline">
            ${schedule.map((stop, index) => timelineItem(stop, index)).join("")}
          </ol>
        </div>
      `;
    })
    .join("");
}

function timelineItem(stop, index) {
  const typeClass = stop.kind === "delivery" ? "delivery-step" : stop.kind === "pickup" ? "pickup-step" : stop.kind === "safe" ? "safe-step" : "";
  const pathText = stop.legPath?.length > 2 ? ` · 路徑 ${stop.legPath.join("→")}` : "";
  const timeText = index === 0
    ? "出發準備 · 累積 0 min"
    : `耗費 ${stop.legTime} min · 累積 ${stop.cumulativeTime} min${pathText}`;
  return `
    <li>
      <span class="timeline-node ${typeClass}">${index + 1}</span>
      <div>
        <strong>${stop.name}</strong>
        <small>${stop.label}</small>
        <p class="time-chip">${timeText}</p>
        <p>${stop.status}</p>
      </div>
    </li>
  `;
}

function refreshVehicleCode() {
  const nextId = Math.max(0, ...state.vehicles.map((vehicle) => vehicle.id)) + 1;
  els.vehicleCode.value = `車輛 #${nextId}`;
  els.vehicleCapacity.value = "40";
}

function normalizeVehicles() {
  state.vehicles = state.vehicles.map((vehicle) => ({
    id: Number(vehicle.id),
    name: vehicle.name || `車輛 #${vehicle.id}`,
    capacity: Number(vehicle.capacity || 40),
  }));
}

function setSelectedNode(nodeId) {
  state.selectedNodeId = Number(nodeId);
  render();
}

function updateNodeFromInspector() {
  const node = nodeById(state.selectedNodeId);
  if (!node) return;

  node.type = els.nodeType.value;
  node.amount = Number(els.taskAmount.value || 0);
  node.selected = node.id === state.startNodeId ? false : els.includeTask.checked;

  if (node.type === "depot") {
    setStartNode(node.id);
  }

  clearOptimization();
  render();
}

function setStartNode(nodeId) {
  const nextStart = nodeById(nodeId);
  if (!nextStart) return;

  state.startNodeId = nextStart.id;
  state.selectedNodeId = nextStart.id;
  state.nodes.forEach((node) => {
    if (node.id === nextStart.id) {
      node.type = "depot";
      node.selected = false;
    } else if (node.type === "depot") {
      node.type = "delivery";
    }
  });
  clearOptimization();
}

function deleteSelectedNode() {
  const node = nodeById(state.selectedNodeId);
  if (!node) return;

  if (node.id === state.startNodeId) {
    showToast("起點是配送中心，請先改選其他起點再刪除。");
    return;
  }

  if (state.nodes.length <= 1) {
    showToast("地圖至少需要保留一個節點。");
    return;
  }

  const ok = window.confirm(`確定刪除「${node.id} ${node.name}」嗎？相關道路與任務也會一起移除。`);
  if (!ok) return;

  state.nodes = state.nodes.filter((item) => item.id !== node.id);
  state.edges = state.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id);
  delete state.assignments[node.id];
  state.pendingEdgeNodeId = state.pendingEdgeNodeId === node.id ? null : state.pendingEdgeNodeId;
  state.selectedNodeId = state.startNodeId;
  clearOptimization();
  render();
  showToast(`已刪除 ${node.name}，相關道路與最佳化結果已同步更新。`);
}

function handleNodeClick(nodeId) {
  const node = nodeById(nodeId);
  if (!node) return;

  if (state.mode === "edge") {
    handleEdgeNodeClick(node.id);
    return;
  }

  state.selectedNodeId = node.id;
  render();
}

function handleEdgeNodeClick(nodeId) {
  if (!state.pendingEdgeNodeId) {
    state.pendingEdgeNodeId = nodeId;
    setSelectedNode(nodeId);
    showToast("請再點選第二個節點來建立道路。");
    return;
  }

  if (state.pendingEdgeNodeId === nodeId) {
    state.pendingEdgeNodeId = null;
    render();
    return;
  }

  const exists = state.edges.some(
    (edge) => (edge.from === state.pendingEdgeNodeId && edge.to === nodeId) || (edge.from === nodeId && edge.to === state.pendingEdgeNodeId)
  );

  if (!exists) {
    const input = window.prompt("請輸入兩點之間的行車時間", "8");
    const weight = Math.max(1, Number(input || 8));
    state.edges.push({ from: state.pendingEdgeNodeId, to: nodeId, weight });
    clearOptimization();
    showToast("已新增道路權重。");
  } else {
    showToast("這兩個節點已經有道路。");
  }

  state.pendingEdgeNodeId = null;
  state.selectedNodeId = nodeId;
  render();
}

function addNodeFromMap(event) {
  if (state.mode !== "node" || event.target.closest(".node")) return;
  const point = svgPoint(event);
  const nextId = Math.max(...state.nodes.map((node) => node.id)) + 1;
  state.nodes.push({
    id: nextId,
    name: `新站點 ${nextId}`,
    type: "delivery",
    x: Math.round(point.x),
    y: Math.round(point.y),
    amount: 5,
    selected: false,
  });
  state.selectedNodeId = nextId;
  clearOptimization();
  render();
  showToast(`已新增節點 ${nextId}。`);
}

function svgPoint(event) {
  const point = els.graphMap.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(els.graphMap.getScreenCTM().inverse());
}

function addVehicle(name, capacity) {
  const id = Math.max(0, ...state.vehicles.map((vehicle) => vehicle.id)) + 1;
  state.vehicles.push({ id, name: name?.trim() || `車輛 #${id}`, capacity: Number(capacity || 40) });
  state.activeVehicleId = id;
  state.editingVehicleId = null;
  clearOptimization();
  render();
  showToast(`已新增 ${vehicleLabel(id)}。`);
}

function deleteVehicle(vehicleId) {
  if (state.vehicles.length <= 1) {
    showToast("至少需要保留一台配送車輛。");
    return;
  }
  const removedName = vehicleLabel(vehicleId);
  state.vehicles = state.vehicles.filter((vehicle) => vehicle.id !== Number(vehicleId));
  state.editingVehicleId = state.editingVehicleId === Number(vehicleId) ? null : state.editingVehicleId;
  state.activeVehicleId = state.vehicles[0].id;
  clearOptimization();
  render();
  showToast(`已刪除 ${removedName}，請重新最佳化。`);
}

function saveVehicleEdit(vehicleId) {
  const vehicle = vehicleById(vehicleId);
  if (!vehicle) return;

  const card = els.fleetList.querySelector(`.fleet-card[data-vehicle-id="${vehicle.id}"]`);
  const nameInput = card?.querySelector(".fleet-name-input");
  const capacityInput = card?.querySelector(".fleet-capacity-input");
  const nextName = nameInput?.value.trim() || `車輛 #${vehicle.id}`;
  const nextCapacity = Math.max(1, Number(capacityInput?.value || 1));

  const changed = vehicle.name !== nextName || vehicle.capacity !== nextCapacity;
  vehicle.name = nextName;
  vehicle.capacity = nextCapacity;
  state.editingVehicleId = null;

  if (changed) {
    clearOptimization();
    showToast(`${vehicle.name} 已保存，請重新最佳化。`);
  }

  render();
}

function buildOptimizationPayload() {
  const tasks = state.nodes.filter((node) => node.selected && node.id !== state.startNodeId);
  return {
    depot: state.startNodeId,
    depot_name: nodeById(state.startNodeId)?.name || `Node ${state.startNodeId}`,
    graph: state.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
    })),
    vehicles: state.vehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      capacity: vehicle.capacity,
    })),
    destinations: tasks.map((node) => ({
      id: node.id,
      name: node.name,
      delivery: node.type === "delivery" ? Number(node.amount || 0) : 0,
      pickup: node.type === "pickup" ? Number(node.amount || 0) : 0,
    })),
  };
}

function apiEndpoint() {
  return window.location.protocol === "file:" ? "http://127.0.0.1:5000/api/optimize" : "/api/optimize";
}

function stopKind(stop) {
  if (stop.event === "return") return "safe";
  if (stop.event === "start") return "depot";
  if (stop.pickup > 0 && stop.delivery === 0) return "pickup";
  return "delivery";
}

function stopLabel(stop) {
  if (stop.event === "start") return "起點";
  if (stop.event === "return") return "終點";
  const parts = [];
  if (stop.delivery > 0) parts.push(`送貨 -${stop.delivery}`);
  if (stop.pickup > 0) parts.push(`取貨 +${stop.pickup}`);
  return parts.join(" / ") || "任務站點";
}

function applyOptimizationResult(result) {
  const assignments = {};
  Object.entries(result.assignments || {}).forEach(([nodeId, vehicleId]) => {
    assignments[Number(nodeId)] = Number(vehicleId);
  });

  const schedules = {};
  const routes = {};
  const vehicleTimes = {};
  (result.routes || []).forEach((vehicleRoute) => {
    const vehicleId = Number(vehicleRoute.vehicle_id);
    routes[vehicleId] = (vehicleRoute.sequence || []).map(Number);
    vehicleTimes[vehicleId] = Number(vehicleRoute.travel_time || 0);
    schedules[vehicleId] = (vehicleRoute.stops || []).map((stop) => ({
      nodeId: Number(stop.node_id),
      name: stop.name,
      label: stopLabel(stop),
      status: stop.status,
      kind: stopKind(stop),
      legTime: Number(stop.travel_from_previous || 0),
      cumulativeTime: Number(stop.cumulative_time || 0),
    }));
  });

  Object.values(schedules).forEach((schedule) => {
    schedule.forEach((stop, index) => {
      if (index === 0) {
        stop.legPath = [];
        return;
      }
      stop.legPath = expandRouteToMapPath([schedule[index - 1].nodeId, stop.nodeId]);
    });
  });

  state.assignments = assignments;
  state.schedules = schedules;
  state.routes = routes;
  state.vehicleTimes = vehicleTimes;
  state.totalTime = Math.round(Number(result.total_time || 0) * 100) / 100;
  state.runtimeMs = Number(result.runtime_ms || 0);
  state.optimized = true;
  state.activeVehicleId = state.vehicles[0]?.id ?? null;
  els.statusDot.classList.add("active");
}

async function runOptimization() {
  const tasks = state.nodes.filter((node) => node.selected && node.id !== state.startNodeId);
  if (tasks.length === 0) {
    showToast("請先勾選至少一個配送或取貨任務。");
    return;
  }

  els.runButton.disabled = true;
  els.runButton.innerHTML = "<span>⌛</span> Optimizing...";

  try {
    const response = await fetch(apiEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOptimizationPayload()),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "最佳化失敗，請檢查地圖與車隊設定。");
    }

    applyOptimizationResult(result);
    render();
    showToast("後端演算法完成，任務分配與時間軸已同步更新。");
  } catch (error) {
    clearOptimization();
    render();
    showToast(error.message || "無法連線到後端 API，請確認 Flask 已啟動。");
  } finally {
    els.runButton.disabled = false;
    els.runButton.innerHTML = "<span>▶</span> Run Optimization";
  }
}

function saveDraft() {
  const draft = {
    startNodeId: state.startNodeId,
    vehicles: state.vehicles,
    nodes: state.nodes,
    edges: state.edges,
  };
  localStorage.setItem("deliveryDraft", JSON.stringify(draft));
  showToast("草稿已儲存在此瀏覽器。");
}

function resetDemo() {
  localStorage.removeItem("deliveryDraft");
  window.location.reload();
}

function loadDraft() {
  const raw = localStorage.getItem("deliveryDraft");
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    state.startNodeId = draft.startNodeId ?? state.startNodeId;
    state.vehicles = draft.vehicles ?? state.vehicles;
    normalizeVehicles();
    state.nodes = draft.nodes ?? state.nodes;
    state.edges = draft.edges ?? state.edges;
    state.selectedNodeId = state.startNodeId;
  } catch {
    localStorage.removeItem("deliveryDraft");
  }
}

function importMap(file) {
  if (!file) return;
  els.uploadName.textContent = file.name;

  if (!file.name.toLowerCase().endsWith(".json")) {
    showToast("目前示範版支援 JSON 匯入，CSV 已預留介面。");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data.nodes)) state.nodes = data.nodes;
      if (Array.isArray(data.edges)) state.edges = data.edges;
      state.startNodeId = data.startNodeId ?? state.nodes[0]?.id ?? 1;
      state.selectedNodeId = state.startNodeId;
      clearOptimization();
      render();
      showToast("地圖 JSON 已匯入。");
    } catch {
      showToast("JSON 格式無法讀取。");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll(".tool-btn").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    state.pendingEdgeNodeId = null;
    document.querySelectorAll(".tool-btn").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    els.modeLabel.textContent = modeLabels[state.mode];
    renderGraph();
  });
});

els.nodeLayer.addEventListener("click", (event) => {
  const node = event.target.closest(".node");
  if (!node) return;
  handleNodeClick(node.dataset.nodeId);
});

els.nodeLayer.addEventListener("contextmenu", (event) => {
  const node = event.target.closest(".node");
  if (!node) return;
  event.preventDefault();
  setStartNode(Number(node.dataset.nodeId));
  render();
  showToast(`已將 ${nodeById(state.startNodeId).name} 設為起點。`);
});

els.graphMap.addEventListener("click", addNodeFromMap);

els.startNode.addEventListener("change", () => {
  setStartNode(Number(els.startNode.value));
  render();
});

els.nodeType.addEventListener("change", updateNodeFromInspector);
els.taskAmount.addEventListener("input", updateNodeFromInspector);
els.includeTask.addEventListener("change", updateNodeFromInspector);
els.deleteNodeBtn.addEventListener("click", deleteSelectedNode);

els.taskList.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".task-toggle");
  if (!checkbox) return;
  const node = nodeById(checkbox.dataset.nodeId);
  node.selected = checkbox.checked;
  clearOptimization();
  render();
});

els.taskList.addEventListener("click", (event) => {
  const task = event.target.closest(".task-item");
  if (!task) return;
  setSelectedNode(task.dataset.taskNodeId);
});

document.querySelector("#addFleetBtn").addEventListener("click", () => {
  refreshVehicleCode();
  els.fleetForm.classList.add("open");
});

document.querySelector("#cancelFleetBtn").addEventListener("click", () => {
  els.fleetForm.classList.remove("open");
});

els.fleetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addVehicle(els.vehicleCode.value, els.vehicleCapacity.value);
  els.fleetForm.classList.remove("open");
});

els.fleetList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-fleet-btn");
  if (deleteButton) {
    deleteVehicle(deleteButton.dataset.vehicleId);
    return;
  }

  const saveButton = event.target.closest(".save-fleet-btn");
  if (saveButton) {
    saveVehicleEdit(saveButton.dataset.vehicleId);
    return;
  }

  const cancelButton = event.target.closest(".cancel-fleet-edit-btn");
  if (cancelButton) {
    state.editingVehicleId = null;
    renderFleet();
    return;
  }

  const card = event.target.closest(".fleet-card");
  if (!card || card.classList.contains("editing")) return;
  state.editingVehicleId = Number(card.dataset.vehicleId);
  renderFleet();
});

els.fleetTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".fleet-tab");
  if (!tab) return;
  state.activeVehicleId = Number(tab.dataset.vehicleId);
  renderSchedule();
});

document.querySelector("#runOptimization").addEventListener("click", runOptimization);
document.querySelector("#saveDraftBtn").addEventListener("click", saveDraft);
document.querySelector("#resetMapBtn").addEventListener("click", resetDemo);
document.querySelector("#mapUpload").addEventListener("change", (event) => importMap(event.target.files[0]));

loadDraft();
render();
