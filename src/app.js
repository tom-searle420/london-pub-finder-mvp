(function () {
  const { FEATURE_DEFINITIONS, PUBS } = window.LPF_DATA;
  const scoring = window.LPF_SCORING;
  const STORAGE_KEYS = {
    overrides: "lpf_pub_overrides_v1",
    customPubs: "lpf_custom_pubs_v1"
  };

  const demoPeople = [
    { id: "person_tom", name: "Tom", locationInput: "Walthamstow" },
    { id: "person_sarah", name: "Sarah", locationInput: "Clapham" },
    { id: "person_james", name: "James", locationInput: "Camden" },
    { id: "person_alex", name: "Alex", locationInput: "Hackney" }
  ];

  const defaultPreferences = {
    featureKeys: ["beer_garden", "dog_friendly", "craft_beer"],
    maxPintPrice: 7.25,
    minRating: 4,
    openNow: false,
    notBusy: false
  };

  const state = {
    people: clone(demoPeople),
    preferences: clone(defaultPreferences),
    options: {
      style: "middle",
      selectedPersonId: "person_tom",
      targetArea: ""
    },
    sortBy: "best",
    pubs: [],
    recommendation: null,
    selectedAdminPubId: null,
    editingNewPub: false,
    skipNextHashLoad: false
  };

  const els = {};

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMoney(value) {
    return `GBP ${Number(value || 0).toFixed(2)}`;
  }

  function formatNumber(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function mergePub(base, override) {
    if (!override) return clone(base);
    return {
      ...clone(base),
      ...clone(override),
      features: {
        ...(base.features || {}),
        ...(override.features || {})
      },
      reviewSummary: {
        ...(base.reviewSummary || {}),
        ...(override.reviewSummary || {})
      },
      busyProfile: {
        ...(base.busyProfile || {}),
        ...(override.busyProfile || {})
      }
    };
  }

  function loadPubs() {
    const overrides = readJson(STORAGE_KEYS.overrides, {});
    const customPubs = readJson(STORAGE_KEYS.customPubs, []);
    return PUBS.map((pub) => mergePub(pub, overrides[pub.id])).concat(customPubs);
  }

  function refreshPubs() {
    state.pubs = loadPubs();
    if (!state.selectedAdminPubId && state.pubs.length) {
      state.selectedAdminPubId = state.pubs[0].id;
    }
  }

  function cacheElements() {
    Object.assign(els, {
      peopleList: $("#people-list"),
      locationSuggestions: $("#location-suggestions"),
      searchForm: $("#search-form"),
      addPerson: $("#add-person"),
      loadDemo: $("#load-demo"),
      useCurrentLocation: $("#use-current-location"),
      meetupStyle: $("#meetup-style"),
      selectedPersonRow: $("#selected-person-row"),
      selectedPerson: $("#selected-person"),
      targetAreaRow: $("#target-area-row"),
      targetArea: $("#target-area"),
      featureFilters: $("#feature-filters"),
      maxPrice: $("#max-price"),
      maxPriceOutput: $("#max-price-output"),
      minRating: $("#min-rating"),
      minRatingOutput: $("#min-rating-output"),
      openNow: $("#open-now"),
      notBusy: $("#not-busy"),
      clearFilters: $("#clear-filters"),
      sortResults: $("#sort-results"),
      meetingSummary: $("#meeting-summary"),
      meetingSummaryPage: $("#meeting-summary-page"),
      mapWrap: $("#map-wrap"),
      mapWrapPage: $("#map-wrap-page"),
      resultsList: $("#results-list"),
      resultsListPage: $("#results-list-page"),
      formStatus: $("#form-status"),
      shareResults: $("#share-results"),
      copyShortlist: $("#copy-shortlist"),
      runFromResults: $("#run-from-results"),
      adminPubSelect: $("#admin-pub-select"),
      adminForm: $("#admin-form"),
      adminTable: $("#admin-table"),
      savePub: $("#save-pub"),
      resetAdmin: $("#reset-admin"),
      newPub: $("#new-pub"),
      adminStatus: $("#admin-status"),
      detailDialog: $("#pub-detail-dialog"),
      detailContent: $("#pub-detail-content"),
      closeDetail: $("#close-detail")
    });
  }

  function bindEvents() {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    els.addPerson.addEventListener("click", () => {
      if (state.people.length >= 6) {
        setStatus("This MVP supports up to 6 people.");
        return;
      }
      const next = state.people.length + 1;
      state.people.push({
        id: `person_${Date.now()}`,
        name: `Person ${next}`,
        locationInput: ""
      });
      renderPeople();
    });

    els.peopleList.addEventListener("input", (event) => {
      const row = event.target.closest("[data-person-id]");
      if (!row) return;
      const person = state.people.find((item) => item.id === row.dataset.personId);
      if (!person) return;
      if (event.target.name === "name") person.name = event.target.value;
      if (event.target.name === "location") {
        person.locationInput = event.target.value;
        delete person.lat;
        delete person.lng;
      }
      syncSelectedPersonOptions();
    });

    els.peopleList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-person]");
      if (!button) return;
      if (state.people.length <= 2) {
        setStatus("Keep at least 2 people in the search.");
        return;
      }
      state.people = state.people.filter((item) => item.id !== button.dataset.removePerson);
      renderPeople();
    });

    els.loadDemo.addEventListener("click", () => {
      state.people = clone(demoPeople);
      state.preferences = clone(defaultPreferences);
      state.options = { style: "middle", selectedPersonId: "person_tom", targetArea: "" };
      applyPreferencesToForm();
      renderPeople();
      runSearch({ switchToResults: false });
      setStatus("Demo group loaded.");
    });

    els.useCurrentLocation.addEventListener("click", () => {
      if (!navigator.geolocation) {
        setStatus("Current location is not available in this browser.");
        return;
      }
      setStatus("Waiting for your browser location...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const id = `person_${Date.now()}`;
          state.people.push({
            id,
            name: "Me",
            locationInput: "Current location",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            transitScore: 6
          });
          renderPeople();
          setStatus("Current location added.");
        },
        () => setStatus("Could not use current location.")
      );
    });

    els.meetupStyle.addEventListener("change", () => {
      state.options.style = els.meetupStyle.value;
      renderConditionalOptions();
    });

    els.selectedPerson.addEventListener("change", () => {
      state.options.selectedPersonId = els.selectedPerson.value;
    });

    els.targetArea.addEventListener("input", () => {
      state.options.targetArea = els.targetArea.value;
    });

    els.maxPrice.addEventListener("input", () => {
      els.maxPriceOutput.value = formatMoney(els.maxPrice.value);
    });

    els.minRating.addEventListener("input", () => {
      els.minRatingOutput.value = `${Number(els.minRating.value).toFixed(1)}+`;
    });

    els.clearFilters.addEventListener("click", () => {
      state.preferences = {
        featureKeys: [],
        maxPintPrice: 8.5,
        minRating: 3.5,
        openNow: false,
        notBusy: false
      };
      applyPreferencesToForm();
    });

    els.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch({ switchToResults: true });
    });

    els.sortResults.addEventListener("change", () => {
      state.sortBy = els.sortResults.value;
      runSearch({ switchToResults: false, silent: true });
    });

    els.runFromResults.addEventListener("click", () => runSearch({ switchToResults: false }));

    els.resultsList.addEventListener("click", handleResultClick);
    els.resultsListPage.addEventListener("click", handleResultClick);

    els.shareResults.addEventListener("click", shareResults);
    els.copyShortlist.addEventListener("click", copyShortlist);

    els.adminPubSelect.addEventListener("change", () => {
      state.selectedAdminPubId = els.adminPubSelect.value;
      state.editingNewPub = false;
      renderAdminForm();
    });

    els.newPub.addEventListener("click", () => {
      state.editingNewPub = true;
      state.selectedAdminPubId = `custom_${Date.now()}`;
      renderAdminForm(makeBlankPub());
      els.adminStatus.textContent = "New pub ready to edit.";
    });

    els.savePub.addEventListener("click", saveAdminPub);
    els.resetAdmin.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEYS.overrides);
      localStorage.removeItem(STORAGE_KEYS.customPubs);
      refreshPubs();
      renderAdmin();
      runSearch({ switchToResults: false, silent: true });
      els.adminStatus.textContent = "Local pub edits reset.";
    });

    els.closeDetail.addEventListener("click", () => els.detailDialog.close());
    els.detailDialog.addEventListener("click", (event) => {
      if (event.target === els.detailDialog) els.detailDialog.close();
    });

    window.addEventListener("hashchange", () => {
      if (state.skipNextHashLoad) {
        state.skipNextHashLoad = false;
        return;
      }
      loadSessionFromHash();
    });
  }

  function setView(view) {
    document.querySelectorAll(".nav-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach((section) => {
      section.classList.toggle("is-active", section.id === `view-${view}`);
    });
  }

  function setStatus(message) {
    els.formStatus.textContent = message;
  }

  function renderLocationSuggestions() {
    els.locationSuggestions.innerHTML = scoring
      .getLocationSuggestions()
      .map((location) => `<option value="${escapeHtml(location)}"></option>`)
      .join("");
  }

  function renderFeatureFilters() {
    els.featureFilters.innerHTML = FEATURE_DEFINITIONS.map(
      (feature) => `
        <label class="filter-pill">
          <input type="checkbox" value="${feature.key}" />
          <span>${escapeHtml(feature.label)}</span>
        </label>
      `
    ).join("");
  }

  function renderPeople() {
    els.peopleList.innerHTML = state.people
      .map(
        (person, index) => `
          <div class="person-row" data-person-id="${escapeHtml(person.id)}">
            <div class="person-index">${index + 1}</div>
            <label>
              <span>Name</span>
              <input name="name" value="${escapeHtml(person.name)}" autocomplete="off" />
            </label>
            <label>
              <span>Location</span>
              <input name="location" list="location-suggestions" value="${escapeHtml(
                person.locationInput
              )}" placeholder="Postcode, station or area" autocomplete="off" />
            </label>
            <button class="icon-button subtle" data-remove-person="${escapeHtml(
              person.id
            )}" type="button" aria-label="Remove ${escapeHtml(person.name)}" title="Remove">x</button>
          </div>
        `
      )
      .join("");
    syncSelectedPersonOptions();
  }

  function syncSelectedPersonOptions() {
    els.selectedPerson.innerHTML = state.people
      .map(
        (person) =>
          `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name || "Person")}</option>`
      )
      .join("");
    if (!state.people.some((person) => person.id === state.options.selectedPersonId)) {
      state.options.selectedPersonId = state.people[0]?.id || "";
    }
    els.selectedPerson.value = state.options.selectedPersonId;
  }

  function renderConditionalOptions() {
    const style = els.meetupStyle.value;
    els.selectedPersonRow.classList.toggle("is-visible", style === "closest_person");
    els.targetAreaRow.classList.toggle("is-visible", style === "near_area");
  }

  function applyPreferencesToForm() {
    const preferences = state.preferences;
    els.featureFilters.querySelectorAll("input[type='checkbox']").forEach((input) => {
      input.checked = preferences.featureKeys.includes(input.value);
    });
    els.maxPrice.value = preferences.maxPintPrice;
    els.maxPriceOutput.value = formatMoney(preferences.maxPintPrice);
    els.minRating.value = preferences.minRating;
    els.minRatingOutput.value = `${Number(preferences.minRating).toFixed(1)}+`;
    els.openNow.checked = preferences.openNow;
    els.notBusy.checked = preferences.notBusy;
    els.meetupStyle.value = state.options.style;
    els.targetArea.value = state.options.targetArea || "";
    syncSelectedPersonOptions();
    renderConditionalOptions();
  }

  function readPreferencesFromForm() {
    const featureKeys = Array.from(
      els.featureFilters.querySelectorAll("input[type='checkbox']:checked")
    ).map((input) => input.value);

    state.preferences = {
      featureKeys,
      maxPintPrice: Number(els.maxPrice.value),
      minRating: Number(els.minRating.value),
      openNow: els.openNow.checked,
      notBusy: els.notBusy.checked
    };

    state.options = {
      style: els.meetupStyle.value,
      selectedPersonId: els.selectedPerson.value,
      targetArea: els.targetArea.value.trim()
    };

    state.sortBy = els.sortResults.value;
  }

  function resolvePeople() {
    const resolved = [];
    const unresolved = [];

    state.people.forEach((person, index) => {
      const input = person.lat && person.lng ? person : person.locationInput;
      const location = scoring.resolveLocation(input);
      if (!location) {
        unresolved.push(person.name || `Person ${index + 1}`);
        return;
      }
      resolved.push({
        id: person.id,
        name: person.name || `Person ${index + 1}`,
        locationInput: person.locationInput,
        area: location.area,
        lat: location.lat,
        lng: location.lng,
        transitScore: location.transitScore || person.transitScore || 6
      });
    });

    return { resolved, unresolved };
  }

  function runSearch(options = {}) {
    readPreferencesFromForm();
    const { resolved, unresolved } = resolvePeople();

    if (state.people.length < 2 || resolved.length < 2) {
      setStatus("Add at least 2 recognised London starting points.");
      return;
    }

    if (unresolved.length) {
      setStatus(`Check location for ${unresolved.join(", ")}.`);
      return;
    }

    const recommendation = scoring.calculateRecommendations({
      people: resolved,
      pubs: state.pubs,
      preferences: state.preferences,
      options: state.options,
      sortBy: state.sortBy,
      date: new Date()
    });

    state.recommendation = {
      ...recommendation,
      people: resolved,
      preferences: clone(state.preferences),
      options: clone(state.options)
    };

    renderRecommendations();
    if (!options.silent) {
      setStatus(
        recommendation.results.length
          ? `${recommendation.results.length} pubs ranked.`
          : "No pubs matched those filters."
      );
    }
    if (options.switchToResults) setView("results");
  }

  function renderRecommendations() {
    const recommendation = state.recommendation;
    if (!recommendation) {
      const empty = `<div class="empty-state">Run a search to build a shortlist.</div>`;
      els.meetingSummary.innerHTML = empty;
      els.meetingSummaryPage.innerHTML = empty;
      els.mapWrap.innerHTML = "";
      els.mapWrapPage.innerHTML = "";
      els.resultsList.innerHTML = empty;
      els.resultsListPage.innerHTML = empty;
      return;
    }

    const summary = renderMeetingSummary(recommendation);
    els.meetingSummary.innerHTML = summary;
    els.meetingSummaryPage.innerHTML = summary;
    els.mapWrap.innerHTML = renderMap(recommendation, false);
    els.mapWrapPage.innerHTML = renderMap(recommendation, true);

    const previewCards = recommendation.results
      .slice(0, 5)
      .map((result, index) => renderResultCard(result, index, false))
      .join("");
    const fullCards = recommendation.results
      .map((result, index) => renderResultCard(result, index, true))
      .join("");

    const empty = `<div class="empty-state">No exact match. Try easing price, rating, open-now or busyness filters.</div>`;
    els.resultsList.innerHTML = previewCards || empty;
    els.resultsListPage.innerHTML = fullCards || empty;
  }

  function renderMeetingSummary(recommendation) {
    const area = recommendation.nearestArea?.name || "London";
    const resultCount = recommendation.results.length;
    const best = recommendation.results[0];
    const relaxed = recommendation.relaxedFilters
      ? `<span class="warning-chip">Showing partial feature matches</span>`
      : "";

    return `
      <div class="meeting-card">
        <div>
          <p class="section-kicker">${escapeHtml(recommendation.targetLabel)}</p>
          <h3>${escapeHtml(area)}</h3>
        </div>
        <div class="summary-metrics">
          <span>${resultCount} pubs</span>
          <span>${best ? `${best.averageTravelTimeMinutes} min avg` : "No avg yet"}</span>
          <span>${best ? `${best.maxTravelTimeMinutes} min longest` : "No journeys yet"}</span>
        </div>
        ${relaxed}
      </div>
    `;
  }

  function projectToMap(point) {
    const bounds = {
      minLat: 51.415,
      maxLat: 51.59,
      minLng: -0.245,
      maxLng: 0.01
    };
    const x = ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = (1 - (point.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return {
      x: clampForMap(x),
      y: clampForMap(y)
    };
  }

  function clampForMap(value) {
    return Math.max(3, Math.min(97, value));
  }

  function renderMap(recommendation, large) {
    const topResults = recommendation.results.slice(0, large ? 12 : 7);
    const peoplePins = recommendation.people
      .map((person) => {
        const point = projectToMap(person);
        return `
          <g>
            <circle class="person-pin" cx="${point.x}" cy="${point.y}" r="2.4" />
            <text class="map-label" x="${point.x + 2.2}" y="${point.y - 1.8}">${escapeHtml(
          person.name
        )}</text>
          </g>
        `;
      })
      .join("");

    const pubPins = topResults
      .map((result, index) => {
        const point = projectToMap(result.pub);
        return `
          <g>
            <circle class="pub-pin" cx="${point.x}" cy="${point.y}" r="${large ? 2.8 : 2.5}" />
            <text class="pin-number" x="${point.x}" y="${point.y + 1.1}">${index + 1}</text>
          </g>
        `;
      })
      .join("");

    const target = recommendation.targetPoint ? projectToMap(recommendation.targetPoint) : { x: 50, y: 50 };

    return `
      <svg class="london-map" viewBox="0 0 100 100" role="img" aria-label="Map of recommended pubs">
        <rect x="0" y="0" width="100" height="100" rx="3" />
        <path class="river" d="M0,62 C13,55 20,70 32,61 C44,52 54,58 63,53 C75,45 86,58 100,49" />
        <path class="gridline" d="M18 0 V100 M36 0 V100 M54 0 V100 M72 0 V100 M90 0 V100 M0 20 H100 M0 40 H100 M0 60 H100 M0 80 H100" />
        <circle class="target-ring" cx="${target.x}" cy="${target.y}" r="5.6" />
        <circle class="target-dot" cx="${target.x}" cy="${target.y}" r="1.9" />
        ${peoplePins}
        ${pubPins}
      </svg>
    `;
  }

  function renderResultCard(result, index, expanded) {
    const pub = result.pub;
    const selectedLabels = scoring.featureLabels(result.matchedPreferences);
    const fallbackLabels = FEATURE_DEFINITIONS.filter((feature) => pub.features[feature.key])
      .slice(0, 4)
      .map((feature) => feature.label);
    const labels = selectedLabels.length ? selectedLabels : fallbackLabels;
    const travel = result.travelTimes
      .map((item) => `<span>${escapeHtml(item.person)} ${item.minutes}m</span>`)
      .join("");
    const missing = result.missingPreferences.length
      ? `<p class="missing">Missing: ${escapeHtml(scoring.featureLabels(result.missingPreferences).join(", "))}</p>`
      : "";

    return `
      <article class="pub-card ${expanded ? "expanded" : ""}">
        <div class="rank">${index + 1}</div>
        <div class="pub-main">
          <div class="pub-card-head">
            <div>
              <h3>${escapeHtml(pub.name)}</h3>
              <p>${escapeHtml(pub.area)} - ${escapeHtml(pub.address)}</p>
            </div>
            <div class="score-badge">${result.totalScore}</div>
          </div>

          <div class="pub-stats">
            <span>${formatNumber(pub.googleRating, 1)} rating</span>
            <span>${pub.reviewCount.toLocaleString()} reviews</span>
            <span>${escapeHtml(result.openingStatus.statusText)}</span>
            <span>${escapeHtml(result.busyness.level)}</span>
            <span>${formatMoney(pub.estimatedPintPrice)}</span>
          </div>

          <div class="tag-row">
            ${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
          </div>

          <div class="journey-grid">
            <strong>${result.averageTravelTimeMinutes} min avg</strong>
            <strong>${result.maxTravelTimeMinutes} min longest</strong>
            <span>${result.spreadMinutes} min spread</span>
            <span>${formatNumber(result.midpointDistanceKm, 1)} km from target</span>
          </div>

          <div class="travel-chips">${travel}</div>
          <p class="why">${escapeHtml(result.explanation)}</p>
          ${expanded ? missing : ""}

          <div class="card-actions">
            <button class="secondary-button" data-view-detail="${escapeHtml(pub.id)}" type="button">View details</button>
            <a class="link-button" href="${escapeHtml(pub.googleMapsUrl)}" target="_blank" rel="noreferrer">Google Maps</a>
          </div>
        </div>
      </article>
    `;
  }

  function handleResultClick(event) {
    const button = event.target.closest("[data-view-detail]");
    if (!button) return;
    showDetail(button.dataset.viewDetail);
  }

  function showDetail(pubId) {
    const result = state.recommendation?.results.find((item) => item.pub.id === pubId);
    const pub = result?.pub || state.pubs.find((item) => item.id === pubId);
    if (!pub) return;

    const status = result?.openingStatus || scoring.openingStatus(pub);
    const busy = result?.busyness || scoring.estimateBusy(pub);
    const week = scoring.fullWeekHours(pub)
      .map((item) => `<li><span>${item.day}</span><strong>${item.hours}</strong></li>`)
      .join("");
    const features = FEATURE_DEFINITIONS.map(
      (feature) =>
        `<span class="${pub.features[feature.key] ? "is-on" : "is-off"}">${escapeHtml(feature.label)}</span>`
    ).join("");
    const travelRows = result
      ? result.travelTimes
          .map(
            (item) =>
              `<li><span>${escapeHtml(item.person)}</span><strong>${item.minutes} minutes</strong></li>`
          )
          .join("")
      : "<li><span>Run a search</span><strong>Travel times appear here</strong></li>";

    els.detailContent.innerHTML = `
      <div class="detail-head">
        <div>
          <p class="section-kicker">${escapeHtml(pub.area)}</p>
          <h2>${escapeHtml(pub.name)}</h2>
          <p>${escapeHtml(pub.address)}</p>
        </div>
        ${result ? `<div class="score-badge large">${result.totalScore}</div>` : ""}
      </div>

      <div class="detail-stats">
        <span>${formatNumber(pub.googleRating, 1)} rating</span>
        <span>${pub.reviewCount.toLocaleString()} reviews</span>
        <span>${escapeHtml(status.statusText)}</span>
        <span>${escapeHtml(busy.level)}</span>
        <span>${formatMoney(pub.estimatedPintPrice)}</span>
      </div>

      <div class="detail-grid">
        <section>
          <h3>Why this pub?</h3>
          <p>${escapeHtml(result?.explanation || "This pub is in the seed dataset and can be included in a future search.")}</p>
          <div class="feature-matrix">${features}</div>
        </section>

        <section>
          <h3>Travel breakdown</h3>
          <ul class="detail-list">${travelRows}</ul>
        </section>

        <section>
          <h3>Opening hours</h3>
          <p class="muted">Today: ${escapeHtml(status.todayHours)}</p>
          <ul class="detail-list">${week}</ul>
        </section>

        <section>
          <h3>Review summary</h3>
          <p><strong>${escapeHtml(pub.reviewSummary?.sentiment || "Not summarised yet")}</strong></p>
          <p>${escapeHtml((pub.reviewSummary?.themes || []).join(", "))}</p>
          <p class="muted">${escapeHtml((pub.reviewSummary?.concerns || []).join(", "))}</p>
        </section>
      </div>

      <div class="detail-actions">
        <a class="primary-button as-link" href="${escapeHtml(pub.googleMapsUrl)}" target="_blank" rel="noreferrer">Open in Google Maps</a>
        ${pub.website ? `<a class="secondary-button as-link" href="${escapeHtml(pub.website)}" target="_blank" rel="noreferrer">Website</a>` : ""}
      </div>
    `;

    els.detailDialog.showModal();
  }

  function shareResults() {
    readPreferencesFromForm();
    const payload = {
      people: state.people,
      preferences: state.preferences,
      options: state.options,
      sortBy: state.sortBy
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${location.origin}${location.pathname}#session=${encoded}`;
    state.skipNextHashLoad = true;
    location.hash = `session=${encoded}`;
    window.setTimeout(() => {
      state.skipNextHashLoad = false;
    }, 250);
    copyText(url)
      .then(() => setStatus("Share link copied."))
      .catch(() => setStatus("Share link added to the address bar."));
  }

  function copyShortlist() {
    if (!state.recommendation?.results.length) {
      setStatus("Run a search before copying a shortlist.");
      return;
    }
    const lines = state.recommendation.results.slice(0, 5).map((result, index) => {
      const pub = result.pub;
      return `${index + 1}. ${pub.name} - ${pub.area}: score ${result.totalScore}, ${result.averageTravelTimeMinutes} min avg, ${result.maxTravelTimeMinutes} min longest. ${result.explanation}`;
    });
    copyText(lines.join("\n"))
      .then(() => setStatus("Shortlist copied."))
      .catch(() => setStatus("Clipboard blocked. The shortlist is still visible here."));
  }

  function copyText(text) {
    return fallbackCopyText(text);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("Clipboard blocked"));
  }

  function loadSessionFromHash() {
    if (!location.hash.startsWith("#session=")) return false;
    try {
      const raw = location.hash.replace("#session=", "");
      const payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (payload.people?.length) state.people = payload.people;
      if (payload.preferences) state.preferences = payload.preferences;
      if (payload.options) state.options = payload.options;
      if (payload.sortBy) state.sortBy = payload.sortBy;
      els.sortResults.value = state.sortBy;
      renderPeople();
      applyPreferencesToForm();
      runSearch({ switchToResults: true, silent: true });
      setStatus("Shared shortlist loaded.");
      return true;
    } catch (error) {
      setStatus("Could not load the shared shortlist.");
      return false;
    }
  }

  function makeBlankPub() {
    const features = FEATURE_DEFINITIONS.reduce((acc, feature) => {
      acc[feature.key] = false;
      return acc;
    }, {});

    return {
      id: state.selectedAdminPubId || `custom_${Date.now()}`,
      googlePlaceId: "",
      name: "New London pub",
      area: "London",
      address: "",
      lat: 51.515,
      lng: -0.1,
      transitScore: 7,
      googleRating: 4,
      reviewCount: 0,
      priceLevel: 2,
      estimatedPintPrice: 6.5,
      openingHours: clone(PUBS[0].openingHours),
      website: "",
      googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=London+pub",
      features,
      quizNight: "",
      sportsInfo: "",
      sundayRoastInfo: "",
      reviewSummary: {
        sentiment: "Manual notes pending",
        themes: [],
        concerns: []
      },
      busyProfile: { base: "moderate", centrality: 5, quizDay: null, sportsPull: 1, roastPull: 1 },
      adminNotes: ""
    };
  }

  function renderAdmin() {
    const selected = state.pubs.find((pub) => pub.id === state.selectedAdminPubId) || state.pubs[0];
    state.selectedAdminPubId = selected?.id || null;

    els.adminPubSelect.innerHTML = state.pubs
      .map((pub) => `<option value="${escapeHtml(pub.id)}">${escapeHtml(pub.name)} - ${escapeHtml(pub.area)}</option>`)
      .join("");
    if (state.selectedAdminPubId) els.adminPubSelect.value = state.selectedAdminPubId;
    renderAdminForm(selected);
    renderAdminTable();
  }

  function renderAdminForm(pubOverride) {
    const pub = pubOverride || state.pubs.find((item) => item.id === state.selectedAdminPubId) || makeBlankPub();
    const featureInputs = FEATURE_DEFINITIONS.map(
      (feature) => `
        <label class="filter-pill admin-toggle">
          <input type="checkbox" name="${feature.key}" ${pub.features?.[feature.key] ? "checked" : ""} />
          <span>${escapeHtml(feature.label)}</span>
        </label>
      `
    ).join("");

    els.adminForm.innerHTML = `
      <div class="admin-field-grid">
        <label>
          <span>Name</span>
          <input id="admin-name" value="${escapeHtml(pub.name)}" />
        </label>
        <label>
          <span>Area</span>
          <input id="admin-area" value="${escapeHtml(pub.area)}" />
        </label>
        <label class="wide">
          <span>Address</span>
          <input id="admin-address" value="${escapeHtml(pub.address)}" />
        </label>
        <label>
          <span>Latitude</span>
          <input id="admin-lat" type="number" step="0.0001" value="${pub.lat}" />
        </label>
        <label>
          <span>Longitude</span>
          <input id="admin-lng" type="number" step="0.0001" value="${pub.lng}" />
        </label>
        <label>
          <span>Rating</span>
          <input id="admin-rating" type="number" min="0" max="5" step="0.1" value="${pub.googleRating}" />
        </label>
        <label>
          <span>Reviews</span>
          <input id="admin-reviews" type="number" min="0" step="1" value="${pub.reviewCount}" />
        </label>
        <label>
          <span>Pint price</span>
          <input id="admin-pint" type="number" min="0" step="0.1" value="${pub.estimatedPintPrice}" />
        </label>
        <label>
          <span>Transit score</span>
          <input id="admin-transit" type="number" min="1" max="10" step="1" value="${pub.transitScore || 7}" />
        </label>
      </div>

      <div class="filter-grid admin-features">${featureInputs}</div>

      <div class="admin-field-grid">
        <label>
          <span>Quiz night</span>
          <input id="admin-quiz" value="${escapeHtml(pub.quizNight || "")}" placeholder="Tuesday" />
        </label>
        <label>
          <span>Sunday roast info</span>
          <input id="admin-roast-info" value="${escapeHtml(pub.sundayRoastInfo || "")}" />
        </label>
        <label class="wide">
          <span>Football and sport info</span>
          <input id="admin-sports-info" value="${escapeHtml(pub.sportsInfo || "")}" />
        </label>
        <label class="wide">
          <span>Website</span>
          <input id="admin-website" value="${escapeHtml(pub.website || "")}" />
        </label>
        <label class="wide">
          <span>Google Maps link</span>
          <input id="admin-maps" value="${escapeHtml(pub.googleMapsUrl || "")}" />
        </label>
        <label class="wide">
          <span>Admin notes</span>
          <textarea id="admin-notes" rows="4">${escapeHtml(pub.adminNotes || "")}</textarea>
        </label>
      </div>
    `;
  }

  function renderAdminTable() {
    els.adminTable.innerHTML = `
      <div class="admin-table">
        ${state.pubs
          .map((pub) => {
            const tagCount = FEATURE_DEFINITIONS.filter((feature) => pub.features?.[feature.key]).length;
            return `
              <button type="button" data-admin-row="${escapeHtml(pub.id)}">
                <span>${escapeHtml(pub.name)}</span>
                <strong>${escapeHtml(pub.area)}</strong>
                <em>${tagCount} tags</em>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    els.adminTable.querySelectorAll("[data-admin-row]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedAdminPubId = button.dataset.adminRow;
        state.editingNewPub = false;
        renderAdmin();
      });
    });
  }

  function readAdminPubFromForm() {
    const base = state.editingNewPub
      ? makeBlankPub()
      : state.pubs.find((pub) => pub.id === state.selectedAdminPubId) || makeBlankPub();
    const features = FEATURE_DEFINITIONS.reduce((acc, feature) => {
      acc[feature.key] = Boolean(els.adminForm.querySelector(`input[name="${feature.key}"]`)?.checked);
      return acc;
    }, {});

    return {
      ...clone(base),
      id: base.id,
      name: $("#admin-name").value.trim() || base.name,
      area: $("#admin-area").value.trim() || base.area,
      address: $("#admin-address").value.trim(),
      lat: Number($("#admin-lat").value),
      lng: Number($("#admin-lng").value),
      googleRating: Number($("#admin-rating").value),
      reviewCount: Number($("#admin-reviews").value),
      estimatedPintPrice: Number($("#admin-pint").value),
      transitScore: Number($("#admin-transit").value),
      features,
      quizNight: $("#admin-quiz").value.trim(),
      sundayRoastInfo: $("#admin-roast-info").value.trim(),
      sportsInfo: $("#admin-sports-info").value.trim(),
      website: $("#admin-website").value.trim(),
      googleMapsUrl: $("#admin-maps").value.trim(),
      adminNotes: $("#admin-notes").value.trim()
    };
  }

  function saveAdminPub() {
    const pub = readAdminPubFromForm();
    if (!Number.isFinite(pub.lat) || !Number.isFinite(pub.lng)) {
      els.adminStatus.textContent = "Latitude and longitude are required.";
      return;
    }

    if (pub.id.startsWith("custom_")) {
      const customPubs = readJson(STORAGE_KEYS.customPubs, []);
      const next = customPubs.filter((item) => item.id !== pub.id).concat(pub);
      writeJson(STORAGE_KEYS.customPubs, next);
    } else {
      const overrides = readJson(STORAGE_KEYS.overrides, {});
      overrides[pub.id] = pub;
      writeJson(STORAGE_KEYS.overrides, overrides);
    }

    state.editingNewPub = false;
    state.selectedAdminPubId = pub.id;
    refreshPubs();
    renderAdmin();
    runSearch({ switchToResults: false, silent: true });
    els.adminStatus.textContent = `${pub.name} saved.`;
  }

  function init() {
    cacheElements();
    refreshPubs();
    renderLocationSuggestions();
    renderFeatureFilters();
    renderPeople();
    renderConditionalOptions();
    applyPreferencesToForm();
    renderAdmin();
    bindEvents();

    const loaded = loadSessionFromHash();
    if (!loaded) {
      runSearch({ switchToResults: false, silent: true });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
