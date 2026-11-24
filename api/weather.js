"use strict";

const WEATHER_ENDPOINT = "https://api.weatherapi.com/v1/current.json";
const REQUEST_TIMEOUT_MS = 8500;
const MAX_CITY_LENGTH = 80;

/*
 * WeatherAPI resolves the unqualified query "Delhi" to Delhi, Ontario,
 * Canada. This app's popular-city set is India-focused, so the bare label
 * means Delhi, India. Users can still request another Delhi by qualifying it
 * with a region or country, e.g. "Delhi, Canada".
 */
const CITY_QUERY_ALIASES = Object.freeze({
  delhi: "Delhi, India"
});

/**
 * Vercel serverless proxy for WeatherAPI.
 *
 * The API key stays on the server in WEATHER_API_KEY. It is never sent to the
 * browser and never included in a client-side bundle.
 */
module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "method_not_allowed", "Only GET requests are supported.");
  }

  const apiKey = String(process.env.WEATHER_API_KEY || "").trim();
  if (!apiKey) {
    console.error("WEATHER_API_KEY is not configured.");
    return sendError(
      res,
      500,
      "configuration_error",
      "The weather service is not configured correctly."
    );
  }

  const city = normalizeCity(req.query ? req.query.city : "");
  if (!city) {
    return sendError(res, 400, "validation_error", "Enter a city name to check its weather.");
  }

  if (city.length > MAX_CITY_LENGTH) {
    return sendError(res, 400, "validation_error", "City names must be 80 characters or fewer.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const queryCity = CITY_QUERY_ALIASES[city.toLowerCase()] || city;

  try {
    const url = new URL(WEATHER_ENDPOINT);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("q", queryCity);
    url.searchParams.set("aqi", "no");

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "SkyCred/1.0 (WeatherAPI current conditions)"
      },
      signal: controller.signal
    });

    const rawBody = await upstream.text();

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return sendError(
        res,
        502,
        "service_unavailable",
        "The weather service returned an unexpected response."
      );
    }

    if (payload && payload.error) {
      const mapped = mapWeatherApiError(payload.error, upstream.status);
      return sendError(res, mapped.status, mapped.type, mapped.message, payload.error.code);
    }

    if (!upstream.ok) {
      const mapped = mapHttpStatus(upstream.status);
      return sendError(res, mapped.status, mapped.type, mapped.message);
    }

    // Forward the successful response body exactly as received. The frontend
    // uses this text for both the Raw and Formatted JSON views.
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.end(rawBody);
  } catch (error) {
    if (error && error.name === "AbortError") {
      return sendError(
        res,
        504,
        "timeout",
        "The weather service took too long to respond. Please try again."
      );
    }

    console.error("WeatherAPI request failed:", error && error.message ? error.message : error);
    return sendError(
      res,
      503,
      "service_unavailable",
      "The weather service is unavailable right now. Please try again shortly."
    );
  } finally {
    clearTimeout(timeout);
  }
};

function normalizeCity(value) {
  const raw = Array.isArray(value) ? value[0] : value;

  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapWeatherApiError(error, httpStatus) {
  const code = Number(error && error.code);

  if (code === 1006 || httpStatus === 404) {
    return {
      status: 404,
      type: "city_not_found",
      message: "City not found. Check the spelling and try again."
    };
  }

  if (code === 2006 || code === 2007 || code === 1002 || httpStatus === 401 || httpStatus === 403) {
    return {
      status: 500,
      type: "configuration_error",
      message: "The weather service is not configured correctly."
    };
  }

  if (code === 2008 || code === 2009 || httpStatus === 429) {
    return {
      status: 429,
      type: "rate_limited",
      message: "The weather service is temporarily busy. Please try again in a moment."
    };
  }

  if (httpStatus >= 500) {
    return {
      status: 503,
      type: "service_unavailable",
      message: "The weather service is unavailable right now. Please try again shortly."
    };
  }

  return {
    status: 502,
    type: "service_unavailable",
    message: "The weather service returned an unexpected response."
  };
}

function mapHttpStatus(httpStatus) {
  if (httpStatus === 404) {
    return {
      status: 404,
      type: "city_not_found",
      message: "City not found. Check the spelling and try again."
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: 500,
      type: "configuration_error",
      message: "The weather service is not configured correctly."
    };
  }

  if (httpStatus === 429) {
    return {
      status: 429,
      type: "rate_limited",
      message: "The weather service is temporarily busy. Please try again in a moment."
    };
  }

  if (httpStatus >= 500) {
    return {
      status: 503,
      type: "service_unavailable",
      message: "The weather service is unavailable right now. Please try again shortly."
    };
  }

  return {
    status: 502,
    type: "service_unavailable",
    message: "The weather service returned an unexpected response."
  };
}

function sendError(res, status, type, message, code) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.end(
    JSON.stringify({
      error: {
        type,
        message,
        ...(code === undefined ? {} : { code })
      }
    })
  );
}
