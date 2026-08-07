(function () {
  const TILE_LAYERS = {
    std: {
      url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
      options: { maxZoom: 18, minZoom: 5, attribution: '地図: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' },
    },
    pale: {
      url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
      options: { maxZoom: 18, minZoom: 5, attribution: '地図: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' },
    },
    photo: {
      url: "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
      options: { maxZoom: 18, minZoom: 5, attribution: '航空写真: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>' },
    },
  };

  const map = L.map("map", { zoomControl: true }).setView([37.2, 137.5], 5);

  let currentTileLayer = L.tileLayer(TILE_LAYERS.std.url, TILE_LAYERS.std.options).addTo(map);

  function switchLayer(key) {
    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(TILE_LAYERS[key].url, TILE_LAYERS[key].options).addTo(map);
    document.querySelectorAll(".layer-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.layer === key);
    });
  }

  document.getElementById("layer-switch").addEventListener("click", (e) => {
    const btn = e.target.closest(".layer-btn");
    if (!btn) return;
    switchLayer(btn.dataset.layer);
  });

  function gmapUrl(office) {
    const q = encodeURIComponent(`${office.postal} ${office.address}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  function popupHtml(office) {
    const telHtml = office.tel.length
      ? office.tel
          .map(
            (t) =>
              `<div class="popup-tel">${t.label ? t.label + "：" : ""}<a href="tel:${t.number.replace(/-/g, "")}">${t.number}</a></div>`
          )
          .join("")
      : "";
    return `
      <div class="popup-title">${office.name}</div>
      <div class="popup-address">${office.postal}<br>${office.address}</div>
      ${telHtml}
      <a class="popup-gmap" href="${gmapUrl(office)}" target="_blank" rel="noopener">Googleマップで見る</a>
    `;
  }

  const markers = {};

  OFFICES.forEach((office) => {
    const color = GROUPS[office.group].color;
    const marker = L.circleMarker([office.lat, office.lng], {
      radius: 8,
      color: "#fff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95,
    }).addTo(map);
    marker.bindPopup(popupHtml(office));
    marker.on("click", () => selectOffice(office.id, { pan: false }));
    markers[office.id] = marker;
  });

  // --- leader-line labels -------------------------------------------------
  // Every pin gets a short name label connected by a line, positioned to
  // avoid overlapping other labels/pins via a small greedy placement search.
  const mapWrap = document.querySelector(".map-wrap");
  const svgNS = "http://www.w3.org/2000/svg";
  const leaderSvg = document.createElementNS(svgNS, "svg");
  leaderSvg.setAttribute("class", "leader-svg");
  const labelLayer = document.createElement("div");
  labelLayer.className = "label-layer";
  mapWrap.appendChild(leaderSvg);
  mapWrap.appendChild(labelLayer);

  const measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = '600 11px "Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif';
  function labelBoxWidth(text) {
    return Math.ceil(measureCtx.measureText(text).width) + 14;
  }
  const LABEL_HEIGHT = 20;

  const LABEL_DIRS = [
    { name: "E", dx: 1, dy: 0 },
    { name: "NE", dx: 0.82, dy: -0.57 },
    { name: "SE", dx: 0.82, dy: 0.57 },
    { name: "N", dx: 0, dy: -1 },
    { name: "S", dx: 0, dy: 1 },
    { name: "NW", dx: -0.82, dy: -0.57 },
    { name: "SW", dx: -0.82, dy: 0.57 },
    { name: "W", dx: -1, dy: 0 },
  ];
  const LABEL_LENGTHS = [26, 42, 60, 82, 108, 140];

  function boxForDirection(dir, ep, w, h) {
    switch (dir.name) {
      case "E": return { x1: ep.x, y1: ep.y - h / 2, x2: ep.x + w, y2: ep.y + h / 2 };
      case "W": return { x1: ep.x - w, y1: ep.y - h / 2, x2: ep.x, y2: ep.y + h / 2 };
      case "NE": return { x1: ep.x, y1: ep.y - h, x2: ep.x + w, y2: ep.y };
      case "SE": return { x1: ep.x, y1: ep.y, x2: ep.x + w, y2: ep.y + h };
      case "NW": return { x1: ep.x - w, y1: ep.y - h, x2: ep.x, y2: ep.y };
      case "SW": return { x1: ep.x - w, y1: ep.y, x2: ep.x, y2: ep.y + h };
      case "N": return { x1: ep.x - w / 2, y1: ep.y - h, x2: ep.x + w / 2, y2: ep.y };
      case "S": return { x1: ep.x - w / 2, y1: ep.y, x2: ep.x + w / 2, y2: ep.y + h };
    }
  }
  function boxesOverlap(a, b, margin = 4) {
    return !(a.x2 + margin < b.x1 || a.x1 - margin > b.x2 || a.y2 + margin < b.y1 || a.y1 - margin > b.y2);
  }
  function overlapArea(a, b) {
    const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    return ix * iy;
  }

  let layoutRAF = null;
  function scheduleLayout() {
    if (layoutRAF) return;
    layoutRAF = requestAnimationFrame(() => {
      layoutRAF = null;
      layoutLabels();
    });
  }

  function layoutLabels() {
    const visible = OFFICES.filter(matchesFilters);
    const pins = visible.map((office) => {
      const p = map.latLngToContainerPoint([office.lat, office.lng]);
      return { office, pt: p, box: { x1: p.x - 7, y1: p.y - 7, x2: p.x + 7, y2: p.y + 7 } };
    });
    const placed = pins.map((p) => p.box);
    const results = [];

    pins.forEach((pin) => {
      const text = pin.office.shortName || pin.office.name;
      const w = labelBoxWidth(text);
      const h = LABEL_HEIGHT;
      let chosen = null;
      outer:
      for (const len of LABEL_LENGTHS) {
        for (const dir of LABEL_DIRS) {
          const ep = { x: pin.pt.x + dir.dx * len, y: pin.pt.y + dir.dy * len };
          const box = boxForDirection(dir, ep, w, h);
          if (!placed.some((ob) => boxesOverlap(box, ob))) {
            chosen = { dir, ep, box };
            break outer;
          }
        }
      }
      if (!chosen) {
        const len = LABEL_LENGTHS[LABEL_LENGTHS.length - 1];
        let best = null;
        let bestScore = Infinity;
        for (const dir of LABEL_DIRS) {
          const ep = { x: pin.pt.x + dir.dx * len, y: pin.pt.y + dir.dy * len };
          const box = boxForDirection(dir, ep, w, h);
          const score = placed.reduce((s, ob) => s + overlapArea(box, ob), 0);
          if (score < bestScore) {
            bestScore = score;
            best = { dir, ep, box };
          }
        }
        chosen = best;
      }
      placed.push(chosen.box);
      results.push({ office: pin.office, pin: pin.pt, text, ...chosen });
    });

    renderLabels(results);
  }

  function renderLabels(results) {
    leaderSvg.innerHTML = "";
    labelLayer.innerHTML = "";

    results.forEach(({ office, pin, ep, box, dir, text }) => {
      const color = GROUPS[office.group].color;

      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", pin.x);
      line.setAttribute("y1", pin.y);
      line.setAttribute("x2", ep.x);
      line.setAttribute("y2", ep.y);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "1.4");
      line.setAttribute("opacity", "0.8");
      leaderSvg.appendChild(line);

      const el = document.createElement("div");
      el.className = "office-label" + (office.id === selectedId ? " is-selected" : "");
      el.style.left = box.x1 + "px";
      el.style.top = box.y1 + "px";
      el.style.borderColor = color;
      el.textContent = text;
      el.title = office.name;
      el.addEventListener("click", () => selectOffice(office.id, { pan: false }));
      labelLayer.appendChild(el);
    });
  }

  map.on("move zoom resize", scheduleLayout);
  window.addEventListener("resize", () => {
    map.invalidateSize();
    scheduleLayout();
  });

  // legend
  const legendEl = document.getElementById("legend");
  legendEl.innerHTML = Object.entries(GROUPS)
    .map(
      ([key, g]) =>
        `<div class="legend-row"><span class="dot" style="background:${g.color}"></span>${g.label}</div>`
    )
    .join("");

  // sidebar list
  const listEl = document.getElementById("office-list");
  let activeFilter = "all";
  let searchTerm = "";
  let selectedId = null;

  function matchesFilters(office) {
    const filterOk = activeFilter === "all" || office.group === activeFilter;
    const term = searchTerm.trim().toLowerCase();
    const searchOk =
      !term ||
      office.name.toLowerCase().includes(term) ||
      office.address.toLowerCase().includes(term);
    return filterOk && searchOk;
  }

  function renderList() {
    const visible = OFFICES.filter(matchesFilters);
    Object.entries(markers).forEach(([id, marker]) => {
      const office = OFFICES.find((o) => o.id === id);
      const show = matchesFilters(office);
      const el = marker.getElement && marker.getElement();
      marker.setStyle({ opacity: show ? 1 : 0, fillOpacity: show ? 0.95 : 0 });
      if (marker._path) marker._path.style.pointerEvents = show ? "auto" : "none";
    });

    if (!visible.length) {
      listEl.innerHTML = `<li class="office-card-empty">該当する拠点がありません</li>`;
      return;
    }

    listEl.innerHTML = visible
      .map((office) => {
        const color = GROUPS[office.group].color;
        return `
          <li class="office-card${office.id === selectedId ? " is-selected" : ""}" data-id="${office.id}">
            <div class="office-card-title"><span class="dot" style="background:${color}"></span>${office.name}</div>
            <p class="office-card-address">${office.postal} ${office.address}</p>
          </li>
        `;
      })
      .join("");

    scheduleLayout();
  }

  function selectOffice(id, { pan = true } = {}) {
    selectedId = id;
    const office = OFFICES.find((o) => o.id === id);
    if (pan) {
      map.setView([office.lat, office.lng], 12, { animate: true });
    }
    markers[id].openPopup();
    renderList();
  }

  listEl.addEventListener("click", (e) => {
    const card = e.target.closest(".office-card");
    if (!card) return;
    selectOffice(card.dataset.id);
  });

  document.getElementById("filter-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    renderList();
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    searchTerm = e.target.value;
    renderList();
  });

  renderList();
})();
