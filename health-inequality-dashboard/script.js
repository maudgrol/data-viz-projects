// Colorblind-safe categorical palette (Wong 2011), mapped to income groups
const INCOME_GROUPS = [
  "Low income",
  "Lower middle income",
  "Upper middle income",
  "High income",
];
const COLORS = ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"];
const COLOR_SCALE = d3.scaleOrdinal().domain(INCOME_GROUPS).range(COLORS);

// Chart dimensions
const MARGIN = { top: 24, right: 28, bottom: 52, left: 64 };
let W, H; // set in resize()

// D3 scales (declared globally, defined after data loads)
let xScale, yScale, rScale;

// State
let allData = [];
let allYears = [];
let currentYearIdx = 0;
let playing = false;
let timer = null;
let pinnedCode = null;
let soloMode = false;
let activeGroups = new Set(INCOME_GROUPS);

// SVG layers
let svg, chartG, xAxisG, yAxisG, xLabel, yLabel, bubblesG;

// ── Entry point ──────────────────────────────────────────────────────────────
Promise.all([
  d3.json("./data/data.json"),
  d3.json("./data/years_available.json"),
]).then(([data, years]) => {
  allData = data;
  allYears = years;

  const slider = document.getElementById("year-slider");
  slider.max = allYears.length - 1;
  slider.value = 0;

  buildLegend();
  buildSearchDatalist();
  initChart();
  drawFrame(0, false);
  bindControls();
});

// ── Search ───────────────────────────────────────────────────────────────────
function buildSearchDatalist() {
  const datalist = document.getElementById("country-list");
  [...allData]
    .filter((d) =>
      allYears.some((y) => {
        const v = d.years[String(y)];
        return v?.life_exp != null && v?.health_exp_pc != null;
      })
    )
    .sort((a, b) => a.country.localeCompare(b.country))
    .forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.country;
      datalist.appendChild(opt);
    });
}

function pulseBubble(code) {
  const bubble = bubblesG.selectAll(".bubble").filter((d) => d.code === code);
  if (bubble.empty()) return;
  const baseR = +bubble.attr("r");
  bubble
    .transition().duration(180).attr("r", baseR * 2)
    .transition().duration(180).attr("r", baseR * 1.2)
    .transition().duration(140).attr("r", baseR * 1.7)
    .transition().duration(140).attr("r", baseR);
}

// ── Legend ───────────────────────────────────────────────────────────────────
function buildLegend() {
  const container = document.getElementById("legend");
  INCOME_GROUPS.forEach((group) => {
    const item = document.createElement("div");
    item.className = "legend-item active";
    item.dataset.group = group;
    item.style.color = COLOR_SCALE(group);

    const swatch = document.createElement("div");
    swatch.className = "legend-swatch";
    swatch.style.background = COLOR_SCALE(group);

    item.appendChild(swatch);
    item.appendChild(document.createTextNode(group));
    item.addEventListener("click", () => toggleGroup(group, item));
    container.appendChild(item);
  });
}

function toggleGroup(group, el) {
  if (activeGroups.has(group)) {
    activeGroups.delete(group);
    el.classList.remove("active");
    el.classList.add("inactive");
  } else {
    activeGroups.add(group);
    el.classList.add("active");
    el.classList.remove("inactive");
  }
  drawFrame(currentYearIdx, false);
}

// ── Chart init ───────────────────────────────────────────────────────────────
function initChart() {
  const wrap = document.getElementById("chart-wrap");
  W = wrap.clientWidth - MARGIN.left - MARGIN.right;
  H = Math.round(W * 0.6) - MARGIN.top - MARGIN.bottom;

  svg = d3
    .select("#chart")
    .attr("viewBox", `0 0 ${W + MARGIN.left + MARGIN.right} ${H + MARGIN.top + MARGIN.bottom}`)
    .attr("height", H + MARGIN.top + MARGIN.bottom);

  chartG = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  // Scales
  xScale = d3.scaleLog().domain([10, 12000]).range([0, W]).clamp(true);
  yScale = d3.scaleLinear().domain([30, 90]).range([H, 0]);
  rScale = d3.scaleSqrt().domain([0, 1.5e9]).range([3, 42]);

  // Axes
  xAxisG = chartG.append("g").attr("class", "x-axis").attr("transform", `translate(0,${H})`);
  yAxisG = chartG.append("g").attr("class", "y-axis");

  const xTicks = [10, 30, 100, 300, 1000, 3000, 10000];
  xAxisG.call(
    d3
      .axisBottom(xScale)
      .tickValues(xTicks)
      .tickFormat((d) => (d >= 1000 ? `$${d3.format(".0s")(d)}` : `$${d}`))
      .tickSize(-H)
  );
  yAxisG.call(d3.axisLeft(yScale).ticks(6).tickSize(-W));

  // Axis labels
  chartG
    .append("text")
    .attr("class", "axis-label")
    .attr("x", W / 2)
    .attr("y", H + 42)
    .attr("text-anchor", "middle")
    .text("Health expenditure per capita (current US$, log scale)");

  chartG
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -H / 2)
    .attr("y", -48)
    .attr("text-anchor", "middle")
    .text("Life expectancy at birth (years)");

  bubblesG = chartG.append("g").attr("class", "bubbles");

  // Solo-mode corner label (top-left of chart area, hidden until solo mode)
  const soloLabelG = chartG.append("g")
    .attr("id", "solo-label-g")
    .attr("transform", "translate(8, 8)")
    .attr("opacity", 0)
    .attr("pointer-events", "none");

  soloLabelG.append("rect")
    .attr("class", "solo-bg")
    .attr("height", 32).attr("width", 140)
    .attr("rx", 6)
    .attr("fill", "white").attr("fill-opacity", 0.88)
    .attr("stroke", "#e0ddd8").attr("stroke-width", 1);

  soloLabelG.append("circle")
    .attr("class", "solo-dot")
    .attr("cx", 16).attr("cy", 16).attr("r", 6);

  soloLabelG.append("text")
    .attr("class", "solo-text")
    .attr("x", 30).attr("y", 21)
    .attr("font-size", 13).attr("font-weight", 700).attr("fill", "#1a1a1a");
}

// ── Frame rendering ──────────────────────────────────────────────────────────
function getYearData(yearIdx) {
  const year = String(allYears[yearIdx]);
  return allData
    .filter((d) => {
      if (soloMode && d.code !== pinnedCode) return false;
      return d.years[year] && activeGroups.has(d.income_group);
    })
    .map((d) => ({
      code: d.code,
      country: d.country,
      region: d.region,
      income_group: d.income_group,
      ...d.years[year],
      year,
    }))
    .filter((d) => d.life_exp != null && d.health_exp_pc != null);
}

function drawFrame(yearIdx, animate) {
  currentYearIdx = yearIdx;
  const year = String(allYears[yearIdx]);
  document.getElementById("year-label").textContent = year;
  document.getElementById("year-slider").value = yearIdx;

  const frameData = getYearData(yearIdx);
  const dur = animate ? 750 : 0;

  const bubbles = bubblesG
    .selectAll(".bubble")
    .data(frameData, (d) => d.code);

  const enter = bubbles
    .enter()
    .append("circle")
    .attr("class", "bubble")
    .attr("cx", (d) => xScale(Math.max(d.health_exp_pc, 10)))
    .attr("cy", (d) => yScale(d.life_exp))
    .attr("r", 0)
    .attr("fill", (d) => COLOR_SCALE(d.income_group))
    .attr("stroke", (d) => d3.color(COLOR_SCALE(d.income_group)).darker(0.6))
    .attr("opacity", 0.82)
    .on("mouseover", onBubbleHover)
    .on("mousemove", onBubbleHover)
    .on("mouseout", onBubbleOut)
    .on("click", (event, d) => togglePin(d.code));

  const merged = enter.merge(bubbles);

  (animate ? merged.transition().duration(dur).ease(d3.easeLinear) : merged)
    .attr("cx", (d) => xScale(Math.max(d.health_exp_pc, 10)))
    .attr("cy", (d) => yScale(d.life_exp))
    .attr("r", (d) => rScale(d.population || 0))
    .attr("fill", (d) => COLOR_SCALE(d.income_group))
    .attr("stroke", (d) => d3.color(COLOR_SCALE(d.income_group)).darker(0.6))
    .attr("class", (d) => `bubble${d.code === pinnedCode ? " pinned" : ""}`);

  bubbles.exit().transition().duration(dur).attr("r", 0).remove();

  // Raise pinned bubble so it's on top
  if (pinnedCode) {
    bubblesG
      .selectAll(".bubble")
      .filter((d) => d.code === pinnedCode)
      .raise();
  }

  if (pinnedCode) updateDetailPanel();
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("tooltip");

function onBubbleHover(event, d) {
  const fmt = (v, prefix = "", suffix = "") =>
    v != null ? `${prefix}${typeof v === "number" ? d3.format(",.1f")(v) : v}${suffix}` : "N/A";

  tooltip.innerHTML = `
    <strong>${d.country} (${d.year})</strong>
    Life expectancy: ${fmt(d.life_exp, "", " yrs")}<br/>
    Health spend: ${fmt(d.health_exp_pc, "$", "/capita")}<br/>
    Infant mortality: ${fmt(d.infant_mort, "", "/1k births")}<br/>
    Population: ${d.population ? d3.format(".3s")(d.population) : "N/A"}
  `;
  tooltip.classList.add("visible");
  positionTooltip(event);
}

function onBubbleOut() {
  tooltip.classList.remove("visible");
}

function positionTooltip(event) {
  const wrap = document.getElementById("chart-wrap");
  const rect = wrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const tw = tooltip.offsetWidth || 200;
  const th = tooltip.offsetHeight || 80;
  tooltip.style.left = (x + tw + 12 > rect.width ? x - tw - 12 : x + 12) + "px";
  tooltip.style.top = (y + th + 8 > rect.height ? y - th - 8 : y + 8) + "px";
}

// ── Solo label helpers ───────────────────────────────────────────────────────
function showSoloLabel(code) {
  const country = allData.find((d) => d.code === code);
  if (!country) return;
  const color = COLOR_SCALE(country.income_group);
  const g = chartG.select("#solo-label-g");
  g.select(".solo-dot").attr("fill", color);
  const textEl = g.select(".solo-text").text(country.country);
  const tw = textEl.node().getComputedTextLength();
  g.select(".solo-bg").attr("width", tw + 42);
  g.transition().duration(300).attr("opacity", 1);
}

function hideSoloLabel() {
  chartG.select("#solo-label-g").transition().duration(200).attr("opacity", 0);
}

// ── Pin / trace ───────────────────────────────────────────────────────────────
function togglePin(code) {
  if (pinnedCode === code) {
    resetView();
  } else {
    pinnedCode = code;
    drawTraceLine(code);
    document.getElementById("detail-panel").hidden = false;
    updateDetailPanel();
    document.getElementById("pin-controls").hidden = false;
    document.getElementById("trajectory-btn").innerHTML = animateBtnLabel();
    bubblesG.selectAll(".bubble").classed("pinned", (d) => d.code === code);
  }
}

function resetView() {
  pause();
  soloMode = false;
  pinnedCode = null;
  chartG.selectAll(".trace-line").remove();
  bubblesG.selectAll(".bubble").classed("pinned", false);
  document.getElementById("detail-panel").hidden = true;
  document.getElementById("pin-controls").hidden = true;
  document.getElementById("trajectory-btn").innerHTML = "&#9654; Animate";
  document.getElementById("play-btn").disabled = false;
  hideSoloLabel();
  drawFrame(currentYearIdx, false);
}

function drawTraceLine(code) {
  chartG.selectAll(".trace-line").remove();

  const country = allData.find((d) => d.code === code);
  if (!country) return;

  const points = allYears
    .map((y) => {
      const v = country.years[String(y)];
      return v && v.life_exp != null && v.health_exp_pc != null
        ? [xScale(Math.max(v.health_exp_pc, 10)), yScale(v.life_exp)]
        : null;
    })
    .filter(Boolean);

  if (points.length < 2) return;

  const line = d3.line()(points);
  chartG
    .insert("path", ".bubbles")
    .attr("class", "trace-line")
    .attr("d", line)
    .attr("stroke", COLOR_SCALE(country.income_group));
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function updateDetailPanel() {
  const country = allData.find((d) => d.code === pinnedCode);
  if (!country) return;

  document.getElementById("detail-country-name").textContent = country.country;

  // Compute global average life expectancy per year
  const globalAvg = {};
  allYears.forEach((y) => {
    const vals = allData
      .map((d) => d.years[String(y)]?.life_exp)
      .filter((v) => v != null);
    if (vals.length) globalAvg[y] = d3.mean(vals);
  });

  const countryPoints = allYears
    .map((y) => ({
      year: y,
      value: country.years[String(y)]?.life_exp ?? null,
      avg: globalAvg[y] ?? null,
    }))
    .filter((d) => d.value != null);

  drawDetailChart(countryPoints, country);
}

function drawDetailChart(points, country) {
  const DMARGIN = { top: 16, right: 20, bottom: 30, left: 44 };
  const wrap = document.getElementById("detail-charts");
  const DW = wrap.clientWidth - DMARGIN.left - DMARGIN.right;
  const DH = 160;

  const dSvg = d3.select("#detail-svg")
    .attr("viewBox", `0 0 ${DW + DMARGIN.left + DMARGIN.right} ${DH + DMARGIN.top + DMARGIN.bottom}`)
    .attr("height", DH + DMARGIN.top + DMARGIN.bottom);

  dSvg.selectAll("*").remove();
  const g = dSvg.append("g").attr("transform", `translate(${DMARGIN.left},${DMARGIN.top})`);

  const allVals = points.flatMap((d) => [d.value, d.avg].filter(Boolean));
  const yMin = Math.floor(d3.min(allVals) - 2);
  const yMax = Math.ceil(d3.max(allVals) + 2);

  const dx = d3.scaleLinear().domain(d3.extent(points, (d) => d.year)).range([0, DW]);
  const dy = d3.scaleLinear().domain([yMin, yMax]).range([DH, 0]);

  g.append("g").attr("transform", `translate(0,${DH})`).call(
    d3.axisBottom(dx).ticks(6).tickFormat(d3.format("d")).tickSize(0)
  );
  g.append("g").call(d3.axisLeft(dy).ticks(4).tickSize(-DW));

  const lineGen = d3.line().x((d) => dx(d.year)).y((d) => dy(d.value)).defined((d) => d.value != null);
  const avgGen  = d3.line().x((d) => dx(d.year)).y((d) => dy(d.avg)).defined((d) => d.avg != null);

  // Global average
  g.append("path")
    .datum(points)
    .attr("fill", "none")
    .attr("stroke", "#aaa")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 3")
    .attr("d", avgGen);

  // Country line
  g.append("path")
    .datum(points)
    .attr("fill", "none")
    .attr("stroke", COLOR_SCALE(country.income_group))
    .attr("stroke-width", 2.5)
    .attr("d", lineGen);

  // Year cursor
  const cursorYear = allYears[currentYearIdx];
  const cursorPoint = points.find((d) => d.year === cursorYear);
  if (cursorPoint) {
    g.append("line")
      .attr("x1", dx(cursorYear)).attr("x2", dx(cursorYear))
      .attr("y1", 0).attr("y2", DH)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 2");

    g.append("circle")
      .attr("cx", dx(cursorYear))
      .attr("cy", dy(cursorPoint.value))
      .attr("r", 4)
      .attr("fill", COLOR_SCALE(country.income_group));
  }

  // Legend
  const lg = g.append("g").attr("transform", `translate(${DW - 130}, 4)`);
  [
    { label: country.country, color: COLOR_SCALE(country.income_group), dash: null },
    { label: "Global average", color: "#aaa", dash: "4 3" },
  ].forEach((item, i) => {
    const row = lg.append("g").attr("transform", `translate(0, ${i * 18})`);
    row.append("line")
      .attr("x1", 0).attr("x2", 20).attr("y1", 6).attr("y2", 6)
      .attr("stroke", item.color)
      .attr("stroke-width", item.dash ? 1.5 : 2.5)
      .attr("stroke-dasharray", item.dash || null);
    row.append("text")
      .attr("x", 26).attr("y", 10)
      .attr("font-size", 10)
      .attr("fill", "#555")
      .text(item.label);
  });
}

// ── Controls ─────────────────────────────────────────────────────────────────
function bindControls() {
  const playBtn = document.getElementById("play-btn");
  const slider = document.getElementById("year-slider");

  playBtn.addEventListener("click", () => {
    playing ? pause() : play();
  });

  slider.addEventListener("input", () => {
    pause();
    drawFrame(+slider.value, false);
  });

  const searchInput = document.getElementById("country-search");
  searchInput.addEventListener("change", () => {
    const val = searchInput.value.trim();
    const match = allData.find((d) => d.country.toLowerCase() === val.toLowerCase());
    searchInput.value = "";
    if (!match) return;
    if (pinnedCode !== match.code) togglePin(match.code);
    pulseBubble(match.code);
  });

  document.getElementById("detail-close").addEventListener("click", resetView);
  document.getElementById("reset-btn").addEventListener("click", resetView);

  document.getElementById("trajectory-btn").addEventListener("click", () => {
    if (playing && soloMode) {
      pause();
      return;
    }
    soloMode = true;
    document.getElementById("play-btn").disabled = true;
    document.getElementById("trajectory-btn").innerHTML = "&#9646;&#9646; Pause animation";
    showSoloLabel(pinnedCode);
    const pinnedCountry = allData.find((d) => d.code === pinnedCode);
    const firstValidIdx = allYears.findIndex((y) => {
      const v = pinnedCountry?.years[String(y)];
      return v?.life_exp != null && v?.health_exp_pc != null;
    });
    drawFrame(firstValidIdx >= 0 ? firstValidIdx : 0, false);
    play();
  });
}

function animateBtnLabel() {
  const name = allData.find((d) => d.code === pinnedCode)?.country || "";
  return `&#9654; Animate ${name}`;
}

function play() {
  playing = true;
  if (!soloMode) {
    document.getElementById("play-btn").innerHTML = "&#9646;&#9646; Pause all";
    if (currentYearIdx >= allYears.length - 1) drawFrame(0, false);
  }
  timer = d3.interval(() => {
    if (currentYearIdx >= allYears.length - 1) {
      pause();
      return;
    }
    drawFrame(currentYearIdx + 1, true);
    if (pinnedCode) drawTraceLine(pinnedCode);
  }, 800);
}

function pause() {
  playing = false;
  document.getElementById("play-btn").innerHTML = "&#9654; Play all";
  if (soloMode) {
    document.getElementById("trajectory-btn").innerHTML = animateBtnLabel();
  }
  if (timer) { timer.stop(); timer = null; }
}
