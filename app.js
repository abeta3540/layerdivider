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
