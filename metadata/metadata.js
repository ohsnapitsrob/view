(async function () {
  const config = window.APP_CONFIG || {};
  const container = document.getElementById("metadataContent");

  function normalise(value) {
    return (value || "").toString().trim();
  }

  function normaliseKey(value) {
    return normalise(value).toLowerCase();
  }

  function slugTitle(title) {
    const params = new URLSearchParams();
    params.set("fl", title);
    return `../title/?${params.toString()}`;
  }

  function slugPerson(name, mode) {
    const params = new URLSearchParams();
    params.set(mode, name);
    return `../person/?${params.toString()}`;
  }

  function splitList(value) {
    return normalise(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function getValue(row, key) {
    const target = normaliseKey(key);

    const matchedKey = Object.keys(row).find((rowKey) => {
      return normaliseKey(rowKey) === target;
    });

    return matchedKey ? row[matchedKey] : "";
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const character = text[i];
      const next = text[i + 1];

      if (character === '"' && inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }

      if (character === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (character === "," && !inQuotes) {
        row.push(current);
        current = "";
        continue;
      }

      if ((character === "\n" || character === "\r") && !inQuotes) {
        if (character === "\r" && next === "\n") i++;
        row.push(current);
        current = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        continue;
      }

      current += character;
    }

    row.push(current);
    if (row.length > 1 || row[0] !== "") rows.push(row);

    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];

    const headers = rows[0].map(normalise);

    return rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || "";
      });
      return obj;
    });
  }

  async function loadMetadata() {
    const response = await fetch(config.TITLE_METADATA_CSV, {
      cache: "no-store"
    });

    const csv = await response.text();
    return rowsToObjects(parseCSV(csv));
  }

  function buildMap(rows, column) {
    const map = new Map();

    rows.forEach((row) => {
      const title = normalise(getValue(row, "title"));
      if (!title) return;

      splitList(getValue(row, column)).forEach((entry) => {
        if (!map.has(entry)) {
          map.set(entry, []);
        }

        if (!map.get(entry).includes(title)) {
          map.get(entry).push(title);
        }
      });
    });

    return Array.from(map.entries())
      .filter(([name]) => Boolean(name))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderPopularRail(items, personMode) {
    return `
      <div class="meta-links meta-links-popular">
        ${items.slice(0, 10).map(([name]) => personMode ? `
          <a class="meta-link" href="${slugPerson(name, personMode)}">${name}</a>
        ` : `
          <span class="meta-link">${name}</span>
        `).join("")}
      </div>
    `;
  }

  function renderSection(title, items, options = {}) {
    const popular = [...items]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    return `
      <section class="meta-section">
        <h2>${title}</h2>
        ${renderPopularRail(popular, options.personMode)}
        <div class="meta-group-grid">
          ${items.map(([name, titles]) => `
            <article class="meta-group">
              <h3 class="meta-group-title">
                ${options.personMode ? `<a href="${slugPerson(name, options.personMode)}">${name}</a>` : name}
              </h3>
              <div class="meta-links">
                ${titles
                  .sort((a, b) => a.localeCompare(b))
                  .map((title) => `
                    <a class="meta-link" href="${slugTitle(title)}">${title}</a>
                  `)
                  .join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  try {
    const rows = await loadMetadata();

    const stars = buildMap(rows, "Stars");
    const directors = buildMap(rows, "Director");
    const genres = buildMap(rows, "Genres");
    const ratings = buildMap(rows, "UK Rating");
    const runtimes = buildMap(rows, "Runtime");

    container.innerHTML = [
      renderSection("Stars", stars, { personMode: "star" }),
      renderSection("Directors", directors, { personMode: "director" }),
      renderSection("Genres", genres),
      renderSection("UK Ratings", ratings),
      renderSection("Runtime", runtimes)
    ].join("");
  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <section class="meta-section">
        <h2>Could not load metadata</h2>
        <p>Please try again later.</p>
      </section>
    `;
  }
})();