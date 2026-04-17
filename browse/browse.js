<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>All Titles</title>

  <link rel="stylesheet" href="../styles.css" />

  <style>
    html, body {
      overflow: auto;
      height: auto;
      min-height: 100%;
      background: #fff;
    }

    body {
      display: block;
    }

    .browse-wrap {
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }

    .browse-head {
      display: grid;
      gap: 10px;
      margin-bottom: 18px;
    }

    .browse-head h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
    }

    .browse-tools {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px 42px;
      gap: 10px;
      align-items: center;
      margin-top: 8px;
    }

    .browse-search {
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 16px;
    }

    .browse-sort {
      min-width: 0;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 16px;
      background: #fff;
    }

    .browse-map-btn {
      justify-self: end;
    }

    .browse-count {
      font-size: 13px;
      opacity: 0.75;
      width: 100%;
    }

    .browse-list {
      display: grid;
      gap: 8px;
      margin-top: 18px;
    }

    .browse-row {
      display: grid;
      grid-template-columns: 8px minmax(0, 1fr) 140px 140px;
      gap: 12px;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 0 14px 0 0;
      text-decoration: none;
      color: inherit;
      background: #fff;
      overflow: hidden;
    }

    .browse-row:hover {
      background: #fafafa;
    }

    .browse-marker {
      align-self: stretch;
      width: 8px;
      min-height: 100%;
    }

    .browse-main {
      padding: 12px 0 12px 0;
      min-width: 0;
    }

    .browse-title {
      font-weight: 650;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .browse-type,
    .browse-scenes {
      font-size: 13px;
      opacity: 0.8;
      white-space: nowrap;
      text-align: right;
    }

    .browse-empty {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      font-size: 14px;
      opacity: 0.75;
    }

    @media (max-width: 700px) {
      .browse-row {
        grid-template-columns: 8px 1fr;
        gap: 8px 12px;
        padding-right: 12px;
      }

      .browse-marker {
        grid-row: 1 / span 3;
      }

      .browse-main {
        padding-bottom: 0;
      }

      .browse-type,
      .browse-scenes {
        text-align: left;
        padding-bottom: 8px;
      }

      .browse-head h1 {
        font-size: 26px;
      }

      .browse-tools {
        grid-template-columns: 1fr;
      }

      .browse-sort,
      .browse-map-btn {
        width: 100%;
      }

      .browse-map-btn {
        justify-self: stretch;
      }
    }
  </style>
</head>
<body>
  <div class="browse-wrap">
    <div class="browse-head">
      <h1>All titles</h1>

      <div class="browse-tools">
        <input id="browseSearch" class="browse-search" type="search" placeholder="Filter titles…" autocomplete="off" />

        <select id="browseSort" class="browse-sort" aria-label="Sort titles">
          <option value="most">Most scenes</option>
          <option value="az">A–Z</option>
          <option value="za">Z–A</option>
        </select>

        <a href="../" class="icon-btn browse-map-btn" aria-label="Back to map" title="Back to map">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-1.4 2H9.9L8.5 5H6.4A2.4 2.4 0 0 0 4 7.4v9.2A2.4 2.4 0 0 0 6.4 19h11.2A2.4 2.4 0 0 0 20 16.6V7.4A2.4 2.4 0 0 0 17.6 5H15zm-3 3.5A4.5 4.5 0 1 1 7.5 13A4.5 4.5 0 0 1 12 8.5zm0 2A2.5 2.5 0 1 0 14.5 13A2.5 2.5 0 0 0 12 10.5z"></path>
          </svg>
        </a>

        <div id="browseCount" class="browse-count"></div>
      </div>
    </div>

    <div id="browseList" class="browse-list"></div>
  </div>

  <script src="../config.js"></script>
  <script src="./browse.js"></script>
</body>
</html>
