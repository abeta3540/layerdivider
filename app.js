(function () {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.getElementById("map-svg");
  svg.setAttribute("viewBox", `0 0 ${JAPAN_MAP.svgW} ${JAPAN_MAP.svgH}`);

  function el(tag, attrs) {
    const node = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  // --- defs: soft gradient + shadow for a less flat, more "realistic" land look ---
  const defs = el("defs", {});
  const gradient = el("linearGradient", { id: "landGradient", x1: "0%", y1: "0%", x2: "20%", y2: "100%" });
  gradient.appendChild(el("stop", { offset: "0%", "stop-color": "#9dbb92" }));
  gradient.appendChild(el("stop", { offset: "55%", "stop-color": "#8fae8a" }));
  gradient.appendChild(el("stop", { offset: "100%", "stop-color": "#7fa07c" }));
  defs.appendChild(gradient);

  const shadow = el("filter", { id: "landShadow", x: "-20%", y: "-20%", width: "140%", height: "140%" });
  shadow.appendChild(el("feDropShadow", { dx: "0", dy: "1.5", stdDeviation: "2.5", "flood-color": "#000", "flood-opacity": "0.22" }));
  defs.appendChild(shadow);

  const texture = el("filter", { id: "landTexture", x: "-5%", y: "-5%", width: "110%", height: "110%" });
  texture.appendChild(el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", result: "noise" }));
  texture.appendChild(el("feColorMatrix", { in: "noise", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0" }));
  texture.appendChild(el("feComposite", { in2: "SourceGraphic", operator: "in" }));
  defs.appendChild(texture);
  svg.appendChild(defs);

  // --- base landmass ---
  const landGroup = el("g", { filter: "url(#landShadow)" });
  landGroup.appendChild(el("path", { class: "land", d: JAPAN_MAP.path, fill: "url(#landGradient)", "fill-rule": "evenodd" }));
  const noiseOverlay = el("path", { d: JAPAN_MAP.path, fill: "#1f2a24", filter: "url(#landTexture)", "fill-rule": "evenodd", "pointer-events": "none" });
  landGroup.appendChild(noiseOverlay);
  svg.appendChild(landGroup);

  const pinLayer = el("g", { id: "pin-layer" });
  const leaderLayer = el("g", { id: "leader-layer" });
  const labelLayer = el("g", { id: "label-layer" });
  svg.appendChild(leaderLayer);
  svg.appendChild(pinLayer);
  svg.appendChild(labelLayer);

  // hidden text node used purely for width measurement via getComputedTextLength
  const measureText = el("text", { x: -9999, y: -9999, "font-size": "12", "font-weight": "700" });
  measureText.setAttribute("font-family", 'inherit');
  svg.appendChild(measureText);

  function textWidth(str, fontSize, weight) {
    measureText.setAttribute("font-size", fontSize);
    measureText.setAttribute("font-weight", weight || "400");
    measureText.textContent = str;
    return measureText.getComputedTextLength();
  }

  function wrapLines(str, maxWidth, fontSize, weight, maxLines) {
    const lines = [];
    let current = "";
    for (const ch of str) {
      const test = current + ch;
      if (textWidth(test, fontSize, weight) > maxWidth && current) {
        lines.push(current);
        current = ch;
        if (lines.length === maxLines) break;
      } else {
        current = test;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines) {
      // ensure last line fits, truncate with ellipsis if the source text was cut off mid-way
      const consumed = lines.join("").length;
      if (consumed < str.length) {
        let last = lines[maxLines - 1];
        while (last.length > 0 && textWidth(last + "…", fontSize, weight) > maxWidth) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + "…";
      }
    }
    return lines;
  }

  function gmapUrl(office) {
    const q = encodeURIComponent(`${office.postal} ${office.address}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  // --- pins ---
  const pins = {};
  OFFICES.forEach((office) => {
    const p = projectLatLng(office.lat, office.lng);
    const color = GROUPS[office.group].color;
    const pin = el("circle", {
      class: "office-pin",
      cx: p.x.toFixed(1),
      cy: p.y.toFixed(1),
      r: 3.5,
      fill: color,
    });
    pin.addEventListener("click", () => selectOffice(office.id));
    pinLayer.appendChild(pin);
    pins[office.id] = { pin, pt: p };
  });

  // --- leader-line label layout (greedy 8-direction / growing-length collision search) ---
  const NAME_SIZE = 12;
  const ADDR_SIZE = 9.5;
  const LINE_GAP = 3;
  const BOX_PAD_X = 8;
  const BOX_PAD_Y = 6;
  const MAX_LABEL_WIDTH = 168;

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
  const LABEL_LENGTHS = [42, 64, 90, 120, 155, 195];

  // Generalized box placement: works for both the preset 8-direction search
  // and arbitrary manual dx/dy hints (office.labelDir), so both paths share
  // the same anchoring rule (box extends away from the pin along dx/dy).
  function boxForOffset(dx, dy, ep, w, h) {
    let x1, x2, y1, y2;
    if (dx > 0.3) { x1 = ep.x; x2 = ep.x + w; }
    else if (dx < -0.3) { x1 = ep.x - w; x2 = ep.x; }
    else { x1 = ep.x - w / 2; x2 = ep.x + w / 2; }
    if (dy > 0.3) { y1 = ep.y; y2 = ep.y + h; }
    else if (dy < -0.3) { y1 = ep.y - h; y2 = ep.y; }
    else { y1 = ep.y - h / 2; y2 = ep.y + h / 2; }
    return { x1, y1, x2, y2 };
  }
  function boxesOverlap(a, b, margin = 5) {
    return !(a.x2 + margin < b.x1 || a.x1 - margin > b.x2 || a.y2 + margin < b.y1 || a.y1 - margin > b.y2);
  }
  function overlapArea(a, b) {
    const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    return ix * iy;
  }

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

  function layoutLabels() {
    const visible = OFFICES.filter(matchesFilters);
    const prepared = visible.map((office) => {
      const nameLines = [office.shortName || office.name];
      const addrLines = wrapLines(office.address, MAX_LABEL_WIDTH, ADDR_SIZE, "400", 2);
      const allLineWidths = [
        textWidth(nameLines[0], NAME_SIZE, "700"),
        ...addrLines.map((l) => textWidth(l, ADDR_SIZE, "400")),
      ];
      const w = Math.min(MAX_LABEL_WIDTH, Math.max(...allLineWidths)) + BOX_PAD_X * 2;
      const h = NAME_SIZE + LINE_GAP + addrLines.length * (ADDR_SIZE + LINE_GAP) + BOX_PAD_Y * 2 - LINE_GAP;
      return { office, nameLines, addrLines, w, h, pt: pins[office.id].pt };
    });

    const placed = prepared.map((p) => ({
      x1: p.pt.x - 7, y1: p.pt.y - 7, x2: p.pt.x + 7, y2: p.pt.y + 7,
    }));
    const results = [];

    prepared.forEach((item) => {
      let chosen = null;

      // A manually-tuned direction (set on a handful of offices whose pins
      // sit too close together for the automatic search to read cleanly)
      // takes priority over the generic collision search.
      if (item.office.labelDir) {
        const { dx, dy, len } = item.office.labelDir;
        const ep = { x: item.pt.x + dx * len, y: item.pt.y + dy * len };
        chosen = { ep, box: boxForOffset(dx, dy, ep, item.w, item.h) };
      }

      if (!chosen) {
        outer:
        for (const len of LABEL_LENGTHS) {
          for (const dir of LABEL_DIRS) {
            const ep = { x: item.pt.x + dir.dx * len, y: item.pt.y + dir.dy * len };
            const box = boxForOffset(dir.dx, dir.dy, ep, item.w, item.h);
            if (
              box.x1 > 4 && box.y1 > 4 && box.x2 < JAPAN_MAP.svgW - 4 && box.y2 < JAPAN_MAP.svgH - 4 &&
              !placed.some((ob) => boxesOverlap(box, ob))
            ) {
              chosen = { ep, box };
              break outer;
            }
          }
        }
      }
      if (!chosen) {
        const len = LABEL_LENGTHS[LABEL_LENGTHS.length - 1];
        let best = null;
        let bestScore = Infinity;
        for (const dir of LABEL_DIRS) {
          const ep = { x: item.pt.x + dir.dx * len, y: item.pt.y + dir.dy * len };
          const box = boxForOffset(dir.dx, dir.dy, ep, item.w, item.h);
          const score = placed.reduce((s, ob) => s + overlapArea(box, ob), 0);
          if (score < bestScore) {
            bestScore = score;
            best = { ep, box };
          }
        }
        chosen = best;
      }
      placed.push(chosen.box);
      results.push({ ...item, ...chosen });
    });

    renderLabels(results);
  }

  function renderLabels(results) {
    leaderLayer.innerHTML = "";
    labelLayer.innerHTML = "";

    results.forEach(({ office, pt, ep, box, nameLines, addrLines }) => {
      const color = GROUPS[office.group].color;
      const isSelected = office.id === selectedId;

      const line = el("line", {
        class: "leader-line",
        x1: pt.x.toFixed(1),
        y1: pt.y.toFixed(1),
        x2: ep.x.toFixed(1),
        y2: ep.y.toFixed(1),
        stroke: color,
      });
      leaderLayer.appendChild(line);

      const group = el("g", { class: "office-label", "data-id": office.id });
      const rect = el("rect", {
        class: "office-label-box" + (isSelected ? " is-selected" : ""),
        x: box.x1.toFixed(1),
        y: box.y1.toFixed(1),
        width: (box.x2 - box.x1).toFixed(1),
        height: (box.y2 - box.y1).toFixed(1),
        rx: 4,
        stroke: color,
      });
      group.appendChild(rect);

      let ty = box.y1 + BOX_PAD_Y + NAME_SIZE - 2;
      const tx = box.x1 + BOX_PAD_X;
      const nameEl = el("text", { class: "office-label-name", x: tx.toFixed(1), y: ty.toFixed(1) });
      nameEl.textContent = nameLines[0];
      group.appendChild(nameEl);

      addrLines.forEach((line2) => {
        ty += ADDR_SIZE + LINE_GAP;
        const addrEl = el("text", { class: "office-label-address", x: tx.toFixed(1), y: ty.toFixed(1) });
        addrEl.textContent = line2;
        group.appendChild(addrEl);
      });

      group.addEventListener("click", () => selectOffice(office.id));
      labelLayer.appendChild(group);
    });
  }

  // --- legend ---
  const legendEl = document.getElementById("legend");
  legendEl.innerHTML = Object.entries(GROUPS)
    .map(([key, g]) => `<div class="legend-row"><span class="dot" style="background:${g.color}"></span>${g.label}</div>`)
    .join("");

  // --- sidebar ---
  const listEl = document.getElementById("office-list");

  function telHtml(office) {
    if (!office.tel.length) return "";
    return office.tel
      .map(
        (t) =>
          `<div class="tel-row">${t.label ? t.label + "：" : ""}<a href="tel:${t.number.replace(/-/g, "")}">${t.number}</a></div>`
      )
      .join("");
  }

  function renderList() {
    const visible = OFFICES.filter(matchesFilters);

    Object.entries(pins).forEach(([id, { pin }]) => {
      const office = OFFICES.find((o) => o.id === id);
      const show = matchesFilters(office);
      pin.style.display = show ? "" : "none";
      pin.classList.toggle("is-selected", id === selectedId);
      pin.setAttribute("r", id === selectedId ? 5.5 : 3.5);
    });

    if (!visible.length) {
      listEl.innerHTML = `<li class="office-card-empty">該当する拠点がありません</li>`;
      layoutLabels();
      return;
    }

    listEl.innerHTML = visible
      .map((office) => {
        const color = GROUPS[office.group].color;
        return `
          <li class="office-card${office.id === selectedId ? " is-selected" : ""}" data-id="${office.id}">
            <div class="office-card-title"><span class="dot" style="background:${color}"></span>${office.name}</div>
            <p class="office-card-address">${office.postal} ${office.address}</p>
            <div class="office-card-detail">
              ${telHtml(office)}
              <a class="gmap-link" href="${gmapUrl(office)}" target="_blank" rel="noopener">Googleマップで見る</a>
            </div>
          </li>
        `;
      })
      .join("");

    layoutLabels();
  }

  function selectOffice(id) {
    selectedId = selectedId === id ? null : id;
    renderList();
  }

  listEl.addEventListener("click", (e) => {
    const card = e.target.closest(".office-card");
    if (!card || e.target.closest("a")) return;
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
