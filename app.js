/* ==========================================================================
   SKY CRED — application logic
   Requirements: FR-01 through FR-10
   ========================================================================== */

(() => {
  "use strict";

  const DEFAULT_CITY = "Mumbai";
  const API_ENDPOINT = "/api/weather";

  const POPULAR_CITIES = Object.freeze([
    "Mumbai",
    "Delhi",
    "Bengaluru",
    "Hyderabad",
    "Chennai",
    "Kolkata",
    "Pune",
    "Ahmedabad",
    "New York",
    "London"
  ]);

  /* Interpretation thresholds. Priority order is explicit in interpretWeather(). */
  const THRESHOLDS = Object.freeze({
    coldMaxC: 8,
    hotMinC: 35,
    windyMinKph: 35
  });

  const PERSONALITIES = Object.freeze({
    freeze: Object.freeze({
      title: "Freeze Frame",
      description: "Bone-chilling cold. Bundle up tight."
    }),
    perfect: Object.freeze({
      title: "Perfect Day",
      description: "Great weather to step outside."
    }),
    sun: Object.freeze({
      title: "Sun Alert",
      description: "Stay hydrated and avoid excessive sun exposure."
    }),
    rain: Object.freeze({
      title: "Rain Check",
      description: "Carry an umbrella before stepping out."
    }),
    breeze: Object.freeze({
      title: "Breezy Mode",
      description: "Expect strong winds. Dress accordingly."
    })
  });

  class WeatherError extends Error {
    constructor(code, message) {
      super(message);
      this.name = "WeatherError";
      this.code = code;
    }
  }

  const RAIN_PATTERN = /\b(rain|rainy|drizzle|showers?|thunderstorms?|thundery)\b/i;
  const THUNDER_PATTERN = /\b(thunder|thunderstorm|thundery)\b/i;
  const SNOW_PATTERN = /\b(snow|snowy|sleet|ice|icy|blizzard|freezing)\b/i;
  const CLEAR_PATTERN = /\b(sunny|clear)\b/i;
  const HAZE_PATTERN = /\b(fog|mist|haze|hazy|smoke|smoky|dust|sand)\b/i;
  const CLOUD_PATTERN = /\b(cloud|cloudy|overcast)\b/i;

  const el = {
    footerYear: document.getElementById("footer-year"),
    searchForm: document.getElementById("search-form"),
    searchField: document.querySelector(".search-field"),
    cityInput: document.getElementById("city-input"),
    searchButton: document.getElementById("search-button"),
    searchButtonLabel: document.getElementById("search-button-label"),
    searchError: document.getElementById("search-error"),
    searchStatus: document.getElementById("search-status"),
    popularCities: document.getElementById("popular-cities"),
    weatherShell: document.getElementById("weather-shell"),
    weatherView: document.getElementById("weather-view"),
    initialLoading: document.getElementById("initial-loading"),
    initialError: document.getElementById("initial-error"),
    initialErrorMessage: document.getElementById("initial-error-message"),
    initialRetry: document.getElementById("initial-retry"),
    refreshOverlay: document.getElementById("refresh-overlay"),
    loadingCity: document.getElementById("loading-city"),
    errorBanner: document.getElementById("error-banner"),
    errorMessage: document.getElementById("error-message"),
    errorRetry: document.getElementById("error-retry"),
    weatherCard: document.getElementById("weather-card"),
    cityName: document.getElementById("city-name"),
    cityRegion: document.getElementById("city-region"),
    localTime: document.getElementById("local-time"),
    localDate: document.getElementById("local-date"),
    localZone: document.getElementById("local-zone"),
    conditionIcon: document.getElementById("condition-icon"),
    conditionText: document.getElementById("condition-text"),
    feelsLike: document.getElementById("feels-like"),
    tempC: document.getElementById("temp-c"),
    conditionTag: document.getElementById("condition-tag"),
    scoreRing: document.getElementById("score-ring"),
    skyScore: document.getElementById("sky-score"),
    scoreLabel: document.getElementById("score-label"),
    personalityTitle: document.getElementById("personality-title"),
    personalityDescription: document.getElementById("personality-description"),
    humidityValue: document.getElementById("humidity-value"),
    humidityHint: document.getElementById("humidity-hint"),
    windValue: document.getElementById("wind-value"),
    windHint: document.getElementById("wind-hint"),
    uvValue: document.getElementById("uv-value"),
    uvHint: document.getElementById("uv-hint"),
    cloudValue: document.getElementById("cloud-value"),
    visibilityValue: document.getElementById("visibility-value"),
    pressureValue: document.getElementById("pressure-value"),
    detailWindValue: document.getElementById("detail-wind-value"),
    fahrenheitValue: document.getElementById("fahrenheit-value"),
    updatedValue: document.getElementById("updated-value"),
    tabFormatted: document.getElementById("tab-formatted"),
    tabRaw: document.getElementById("tab-raw"),
    panelFormatted: document.getElementById("panel-formatted"),
    panelRaw: document.getElementById("panel-raw"),
    jsonEmpty: document.getElementById("json-empty"),
    jsonFormatted: document.getElementById("json-formatted"),
    jsonRaw: document.getElementById("json-raw"),
    copyJson: document.getElementById("copy-json"),
    copyLabel: document.getElementById("copy-label"),
    jsonStatus: document.getElementById("json-status")
  };

  const state = {
    hasWeather: false,
    isLoading: false,
    requestId: 0,
    controller: null,
    currentCity: null,
    currentCountry: null,
    timezone: null,
    lastAttemptedCity: DEFAULT_CITY,
    rawJson: "",
    formattedJson: "",
    activeTab: "formatted",
    clockTimer: null,
    scoreFrame: null,
    currentScore: null,
    copyResetTimer: null
  };

  function init() {
    el.footerYear.textContent = String(new Date().getFullYear());
    renderPopularCities();
    bindEvents();
    el.cityInput.value = DEFAULT_CITY;
    loadWeather(DEFAULT_CITY);
  }

  function bindEvents() {
    el.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const city = normalizeCity(el.cityInput.value);

      if (!city) {
        showFieldError("Enter a city name to check its weather.");
        el.cityInput.focus();
        return;
      }

      clearFieldError();
      loadWeather(city);
    });

    el.cityInput.addEventListener("input", () => {
      if (el.cityInput.value.trim()) {
        clearFieldError();
      }
    });

    el.popularCities.addEventListener("click", (event) => {
      const chip = event.target.closest("button[data-city]");
      if (!chip) {
        return;
      }

      const city = chip.dataset.city;
      el.cityInput.value = city;
      clearFieldError();
      loadWeather(city);
    });

    el.initialRetry.addEventListener("click", retryLastSearch);
    el.errorRetry.addEventListener("click", retryLastSearch);

    el.tabFormatted.addEventListener("click", () => selectTab("formatted"));
    el.tabRaw.addEventListener("click", () => selectTab("raw"));
    el.tabFormatted.addEventListener("keydown", handleTabKeydown);
    el.tabRaw.addEventListener("keydown", handleTabKeydown);
    el.copyJson.addEventListener("click", copyCurrentJson);
  }

  function retryLastSearch() {
    const city = state.lastAttemptedCity || state.currentCity || DEFAULT_CITY;
    el.cityInput.value = city;
    loadWeather(city);
  }

  function renderPopularCities() {
    const fragment = document.createDocumentFragment();

    POPULAR_CITIES.forEach((city) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.city = city;
      chip.textContent = city;
      chip.setAttribute("aria-pressed", "false");
      fragment.appendChild(chip);
    });

    el.popularCities.appendChild(fragment);
  }

  function normalizeCity(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function showFieldError(message) {
    el.searchError.textContent = message;
    el.searchError.hidden = false;
    el.cityInput.setAttribute("aria-invalid", "true");
    el.searchField.classList.add("is-invalid");
  }

  function clearFieldError() {
    el.searchError.textContent = "";
    el.searchError.hidden = true;
    el.cityInput.removeAttribute("aria-invalid");
    el.searchField.classList.remove("is-invalid");
  }

  function setSearchStatus(message, success = false) {
    el.searchStatus.textContent = message;
    el.searchStatus.classList.toggle("is-success", success);
  }

  async function loadWeather(city) {
    const normalizedCity = normalizeCity(city);

    if (!normalizedCity) {
      showFieldError("Enter a city name to check its weather.");
      el.cityInput.focus();
      return;
    }

    const requestId = ++state.requestId;
    state.lastAttemptedCity = normalizedCity;

    if (state.controller) {
      state.controller.abort();
    }

    const controller = new AbortController();
    state.controller = controller;

    clearFieldError();
    hideErrorBanner();
    setLoading(true, normalizedCity);

    try {
      const response = await fetch(`${API_ENDPOINT}?city=${encodeURIComponent(normalizedCity)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });

      const rawText = await response.text();

      if (requestId !== state.requestId) {
        return;
      }

      let payload;
      try {
        payload = JSON.parse(rawText);
      } catch {
        throw new WeatherError(
          "unexpected",
          "The weather service returned an unexpected response. Please try again."
        );
      }

      if (!response.ok) {
        throw mapServiceError(response.status, payload);
      }

      assertWeatherPayload(payload);
      commitWeather(payload, rawText);
    } catch (error) {
      if (requestId !== state.requestId || (error && error.name === "AbortError")) {
        return;
      }

      handleWeatherError(toWeatherError(error));
    } finally {
      if (requestId === state.requestId) {
        state.controller = null;
        setLoading(false);
      }
    }
  }

  function setLoading(isLoading, city) {
    state.isLoading = isLoading;
    el.searchForm.classList.toggle("is-loading", isLoading);
    el.searchButton.setAttribute("aria-busy", String(isLoading));
    el.searchButtonLabel.textContent = isLoading ? "Checking…" : "Search";

    if (isLoading) {
      setSearchStatus(`Checking the sky in ${city}…`);
      el.errorBanner.hidden = true;

      if (state.hasWeather) {
        el.loadingCity.textContent = city;
        el.refreshOverlay.hidden = false;
        el.weatherView.setAttribute("aria-busy", "true");
      } else {
        el.initialError.hidden = true;
        el.initialLoading.hidden = false;
        el.weatherView.hidden = true;
      }
    } else {
      el.refreshOverlay.hidden = true;
      el.weatherView.setAttribute("aria-busy", "false");
    }
  }

  function commitWeather(payload, rawText) {
    state.hasWeather = true;
    state.currentCity = payload.location.name;
    state.currentCountry = payload.location.country || "";
    state.timezone = payload.location.tz_id;
    state.rawJson = rawText;
    state.formattedJson = JSON.stringify(payload, null, 2);
    state.lastAttemptedCity = payload.location.name;

    renderWeather(payload);
    renderJson();
    highlightActiveCity(payload.location.name);

    el.cityInput.value = payload.location.name;
    el.initialLoading.hidden = true;
    el.initialError.hidden = true;
    el.weatherView.hidden = false;
    el.refreshOverlay.hidden = true;
    el.errorBanner.hidden = true;
    setSearchStatus(`Showing live conditions for ${payload.location.name}.`, true);
    document.title = `${payload.location.name} · SKY CRED`;
  }

  function renderWeather(payload) {
    const { location, current } = payload;
    const tempC = Number(current.temp_c);
    const tempF = Number(current.temp_f);
    const feelsLike = Number(current.feelslike_c);
    const humidity = Number(current.humidity);
    const wind = Number(current.wind_kph);
    const uv = Number(current.uv);
    const sky = categorizeSky(current.condition);
    const personality = interpretWeather(current);
    const score = calculateSkyScore(current);

    el.cityName.textContent = location.name;
    el.cityRegion.textContent = formatRegion(location);
    el.conditionText.textContent = current.condition.text;
    el.conditionIcon.src = toHttpsUrl(current.condition.icon);
    el.conditionIcon.alt = `${current.condition.text} weather icon`;
    el.feelsLike.textContent = `${formatNumber(feelsLike, 1)}°C`;
    el.tempC.textContent = formatTemperature(tempC);
    el.conditionTag.textContent = current.is_day === 1 ? "Daytime reading" : "Nighttime reading";

    el.humidityValue.textContent = formatNumber(humidity, 0);
    el.humidityHint.textContent = describeHumidity(humidity);
    el.windValue.textContent = formatNumber(wind, 1);
    el.windHint.textContent = describeWind(wind);
    el.uvValue.textContent = formatNumber(uv, 1);
    el.uvHint.textContent = describeUv(uv);

    el.cloudValue.textContent = formatNumber(current.cloud, 0);
    el.visibilityValue.textContent = formatNumber(current.vis_km, 1);
    el.pressureValue.textContent = formatNumber(current.pressure_mb, 0);
    el.detailWindValue.textContent = formatNumber(wind, 1);
    el.fahrenheitValue.textContent = formatNumber(tempF, 0);
    el.updatedValue.textContent = formatUpdatedTime(current.last_updated_epoch, location.tz_id);

    el.personalityTitle.textContent = personality.title;
    el.personalityDescription.textContent = personality.description;
    el.scoreLabel.textContent = scoreLabel(score);

    document.documentElement.dataset.sky = sky;
    el.weatherCard.dataset.sky = sky;

    startCityClock(location.tz_id);
    animateScore(score);
  }

  function startCityClock(timeZone) {
    if (state.clockTimer) {
      window.clearInterval(state.clockTimer);
      state.clockTimer = null;
    }

    const updateClock = () => {
      const now = new Date();

      try {
        el.localTime.textContent = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone
        }).format(now);

        el.localDate.textContent = new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          timeZone
        }).format(now);

        el.localZone.textContent = getTimeZoneName(now, timeZone);
      } catch {
        el.localTime.textContent = new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        }).format(now);
        el.localDate.textContent = new Intl.DateTimeFormat("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short"
        }).format(now);
        el.localZone.textContent = "local";
      }
    };

    updateClock();
    state.clockTimer = window.setInterval(updateClock, 30000);
  }

  function getTimeZoneName(date, timeZone) {
    try {
      const part = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "short"
      })
        .formatToParts(date)
        .find((item) => item.type === "timeZoneName");

      return part ? part.value : timeZone;
    } catch {
      return timeZone;
    }
  }

  function formatUpdatedTime(epochSeconds, timeZone) {
    const epoch = Number(epochSeconds);

    if (!Number.isFinite(epoch)) {
      return "—";
    }

    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone
      }).format(new Date(epoch * 1000));
    } catch {
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(new Date(epoch * 1000));
    }
  }

  function formatRegion(location) {
    const parts = [location.region, location.country].filter(
      (part) => typeof part === "string" && part.trim() && part.trim() !== location.name
    );

    return parts.length ? parts.join(", ") : "Live location";
  }

  function toHttpsUrl(url) {
    if (typeof url !== "string" || !url) {
      return "";
    }

    if (url.startsWith("//")) {
      return `https:${url}`;
    }

    return url.replace(/^http:\/\//i, "https://");
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits,
      minimumFractionDigits: 0
    }).format(number);
  }

  function formatTemperature(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "—";
    }

    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }

  function describeHumidity(value) {
    if (value < 30) return "Dry air";
    if (value <= 60) return "Comfortable";
    if (value <= 80) return "Humid";
    return "Very humid";
  }

  function describeWind(value) {
    if (value < 1) return "Calm";
    if (value < 12) return "Light breeze";
    if (value < 30) return "Breezy";
    if (value < 50) return "Strong winds";
    return "Very strong winds";
  }

  function describeUv(value) {
    if (value < 3) return "Low";
    if (value < 6) return "Moderate";
    if (value < 8) return "High";
    if (value < 11) return "Very high";
    return "Extreme";
  }

  function categorizeSky(condition) {
    const text = String(condition && condition.text ? condition.text : "");

    if (THUNDER_PATTERN.test(text)) return "storm";
    if (SNOW_PATTERN.test(text)) return "snow";
    if (RAIN_PATTERN.test(text)) return "rain";
    if (CLEAR_PATTERN.test(text)) return "clear";
    return "cloud";
  }

  function interpretWeather(current) {
    const tempC = Number(current.temp_c);
    const windKph = Number(current.wind_kph);
    const conditionText = String(current.condition && current.condition.text ? current.condition.text : "");

    /*
     * Overlap policy, highest priority first:
     * 1. Freeze Frame (very cold)
     * 2. Rain Check (wet conditions, including thunderstorms)
     * 3. Sun Alert (very hot)
     * 4. Breezy Mode (strong winds)
     * 5. Perfect Day (everything else)
     */
    if (tempC <= THRESHOLDS.coldMaxC) {
      return PERSONALITIES.freeze;
    }

    if (RAIN_PATTERN.test(conditionText) || THUNDER_PATTERN.test(conditionText)) {
      return PERSONALITIES.rain;
    }

    if (tempC >= THRESHOLDS.hotMinC) {
      return PERSONALITIES.sun;
    }

    if (windKph >= THRESHOLDS.windyMinKph) {
      return PERSONALITIES.breeze;
    }

    return PERSONALITIES.perfect;
  }

  function calculateSkyScore(current) {
    const tempC = Number(current.temp_c);
    const windKph = Number(current.wind_kph);
    const conditionText = String(current.condition && current.condition.text ? current.condition.text : "");
    let score = 100;

    score -= Math.min(38, Math.abs(tempC - 24) * 2.1);

    if (THUNDER_PATTERN.test(conditionText)) {
      score -= 36;
    } else if (RAIN_PATTERN.test(conditionText)) {
      score -= 27;
    } else if (SNOW_PATTERN.test(conditionText)) {
      score -= 30;
    } else if (HAZE_PATTERN.test(conditionText)) {
      score -= 7;
    } else if (CLOUD_PATTERN.test(conditionText)) {
      score -= 4;
    }

    score -= Math.min(20, Math.max(0, windKph - 15) * 0.45);

    return Math.max(5, Math.min(99, Math.round(score)));
  }

  function scoreLabel(score) {
    if (score >= 90) return "Excellent";
    if (score >= 75) return "Good";
    if (score >= 60) return "Fair";
    if (score >= 40) return "Guarded";
    return "Rough";
  }

  function animateScore(target) {
    if (state.scoreFrame) {
      window.cancelAnimationFrame(state.scoreFrame);
      state.scoreFrame = null;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = state.currentScore === null ? 0 : state.currentScore;

    if (reducedMotion) {
      state.currentScore = target;
      setScore(target);
      return;
    }

    const startedAt = performance.now();
    const duration = 760;

    const frame = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(start + (target - start) * eased);
      setScore(value);

      if (progress < 1) {
        state.scoreFrame = window.requestAnimationFrame(frame);
      } else {
        state.currentScore = target;
        state.scoreFrame = null;
      }
    };

    state.scoreFrame = window.requestAnimationFrame(frame);
  }

  function setScore(value) {
    el.scoreRing.style.setProperty("--score", String(value));
    el.skyScore.textContent = String(value);
    el.scoreRing.setAttribute("aria-label", `Sky score ${value} out of 100`);
  }

  function highlightActiveCity(cityName) {
    const activeName = normalizeCity(cityName).toLowerCase();
    const chips = el.popularCities.querySelectorAll(".chip");

    chips.forEach((chip) => {
      const isActive = chip.dataset.city.toLowerCase() === activeName;
      chip.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderJson() {
    el.jsonEmpty.hidden = true;
    el.tabFormatted.disabled = false;
    el.tabRaw.disabled = false;
    el.copyJson.disabled = false;

    el.jsonFormatted.innerHTML = highlightJson(state.formattedJson);
    el.jsonRaw.textContent = state.rawJson;
    el.jsonStatus.textContent = `GET /api/weather?city=${encodeURIComponent(state.currentCity || "")} · 200 OK · ${formatBytes(
      state.rawJson
    )}`;

    selectTab(state.activeTab);
  }

  function selectTab(tab) {
    if (!state.rawJson) {
      return;
    }

    state.activeTab = tab;
    const isFormatted = tab === "formatted";

    el.tabFormatted.setAttribute("aria-selected", String(isFormatted));
    el.tabRaw.setAttribute("aria-selected", String(!isFormatted));
    el.tabFormatted.tabIndex = isFormatted ? 0 : -1;
    el.tabRaw.tabIndex = isFormatted ? -1 : 0;
    el.panelFormatted.hidden = !isFormatted;
    el.panelRaw.hidden = isFormatted;
  }

  function handleTabKeydown(event) {
    const tabs = [el.tabFormatted, el.tabRaw].filter((tab) => !tab.disabled);

    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = tabs.indexOf(document.activeElement);
    let nextIndex = currentIndex;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
    } else if (event.key === "ArrowRight") {
      nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
    }

    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }

    selectTab(nextTab === el.tabRaw ? "raw" : "formatted");
    nextTab.focus();
  }

  function highlightJson(json) {
    const tokenPattern =
      /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g;
    let output = "";
    let lastIndex = 0;
    let match;

    while ((match = tokenPattern.exec(json)) !== null) {
      output += escapeHtml(json.slice(lastIndex, match.index));

      const token = match[0];
      let className = "json-number";

      if (token.startsWith('"')) {
        className = /:\s*$/.test(token) ? "json-key" : "json-string";
      } else if (token === "true" || token === "false") {
        className = "json-boolean";
      } else if (token === "null") {
        className = "json-null";
      }

      output += `<span class="${className}">${escapeHtml(token)}</span>`;
      lastIndex = tokenPattern.lastIndex;
    }

    output += escapeHtml(json.slice(lastIndex));
    return output;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };
      return entities[character];
    });
  }

  function formatBytes(text) {
    const bytes = new Blob([text]).size;
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  async function copyCurrentJson() {
    if (!state.rawJson) {
      return;
    }

    const text = state.activeTab === "formatted" ? state.formattedJson : state.rawJson;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      showCopyFeedback("Copied");
    } catch {
      try {
        fallbackCopy(text);
        showCopyFeedback("Copied");
      } catch {
        showCopyFeedback("Copy failed");
      }
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("Copy command failed");
    }
  }

  function showCopyFeedback(message) {
    if (state.copyResetTimer) {
      window.clearTimeout(state.copyResetTimer);
    }

    el.copyLabel.textContent = message;
    el.copyJson.classList.toggle("is-copied", message === "Copied");

    state.copyResetTimer = window.setTimeout(() => {
      el.copyLabel.textContent = "Copy";
      el.copyJson.classList.remove("is-copied");
      state.copyResetTimer = null;
    }, 1700);
  }

  function assertWeatherPayload(payload) {
    const requiredNumbers = [
      "temp_c",
      "temp_f",
      "feelslike_c",
      "humidity",
      "wind_kph",
      "uv",
      "cloud",
      "vis_km",
      "pressure_mb",
      "last_updated_epoch"
    ];

    const valid =
      payload &&
      typeof payload === "object" &&
      payload.location &&
      typeof payload.location.name === "string" &&
      payload.location.name.trim() &&
      typeof payload.location.tz_id === "string" &&
      payload.location.tz_id.trim() &&
      payload.current &&
      payload.current.condition &&
      typeof payload.current.condition.text === "string" &&
      typeof payload.current.condition.icon === "string" &&
      requiredNumbers.every((field) => Number.isFinite(Number(payload.current[field])));

    if (!valid) {
      throw new WeatherError(
        "unexpected",
        "The weather service returned incomplete data. Please try again."
      );
    }
  }

  function mapServiceError(status, payload) {
    const type = payload && payload.error ? payload.error.type : null;

    if (type === "city_not_found" || status === 404) {
      return new WeatherError("city_not_found", "City not found. Check the spelling and try again.");
    }

    if (type === "configuration_error") {
      return new WeatherError(
        "configuration_error",
        "The weather service is not configured correctly. Please try again later."
      );
    }

    if (type === "rate_limited" || status === 429) {
      return new WeatherError(
        "rate_limited",
        "The weather service is temporarily busy. Please try again in a moment."
      );
    }

    if (status === 503 || status === 502) {
      return new WeatherError(
        "service_unavailable",
        "The weather service is unavailable right now. Please try again shortly."
      );
    }

    if (status === 504) {
      return new WeatherError(
        "timeout",
        "The weather service took too long to respond. Please try again."
      );
    }

    if (status === 400) {
      return new WeatherError(
        "invalid_request",
        (payload && payload.error && payload.error.message) || "That city could not be searched."
      );
    }

    return new WeatherError(
      "unexpected",
      "Something went wrong while fetching the weather. Please try again."
    );
  }

  function toWeatherError(error) {
    if (error instanceof WeatherError) {
      return error;
    }

    if (!navigator.onLine) {
      return new WeatherError(
        "network",
        "You appear to be offline. Check your internet connection and try again."
      );
    }

    return new WeatherError(
      "network",
      "Network error. Check your connection and try again."
    );
  }

  function handleWeatherError(error) {
    const city = state.lastAttemptedCity || "that city";

    if (state.hasWeather) {
      showErrorBanner(
        `${error.message} Still showing the last successful reading for ${state.currentCity}.`
      );
      setSearchStatus(`Couldn't update ${city}.`);
    } else {
      el.initialLoading.hidden = true;
      el.initialError.hidden = false;
      el.initialErrorMessage.textContent = `${error.message} We couldn't load weather for ${city}.`;
      el.weatherView.hidden = true;
      setSearchStatus(`Couldn't load ${city}.`);
    }
  }

  function showErrorBanner(message) {
    el.errorMessage.textContent = message;
    el.errorBanner.hidden = false;
  }

  function hideErrorBanner() {
    el.errorBanner.hidden = true;
    el.errorMessage.textContent = "";
  }

  init();
})();
