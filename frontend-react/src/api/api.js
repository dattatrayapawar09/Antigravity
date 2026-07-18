import axios from "axios";

/* ============================================================
   Base URL
============================================================ */

const BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000/api"
).replace(/\/$/, "");

/* ============================================================
   Axios Instance
============================================================ */

const API = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ============================================================
   Request Logger
============================================================ */

API.interceptors.request.use(
  (config) => {

    console.log(
      `[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
    );

    return config;

  },
  (error) => Promise.reject(error)
);

/* ============================================================
   Response Logger
============================================================ */

API.interceptors.response.use(

  (response) => response,

  (error) => {

    console.error({

      url: error.config?.url,

      method: error.config?.method,

      status: error.response?.status,

      data: error.response?.data,

      message: error.message,

    });

    return Promise.reject(error);

  }

);

/* ============================================================
   Health
============================================================ */

export async function pingBackend() {

  try {

    const { data } = await API.get("/health");

    return data;

  } catch {

    return {

      status: "offline",

      success: false,

    };

  }

}

/* ============================================================
   Dashboard
============================================================ */

export async function getDashboard() {

  const { data } = await API.get("/dashboard");

  return data;

}

/* ============================================================
   Spot Prices
============================================================ */

export async function getSpotPrices(symbols) {

  try {

    const { data } = await API.post(
      "/instruments/spot",
      {
        symbols,
      }
    );

    return data ?? {
      spotPrices: {},
    };

  } catch (err) {

    console.error("Spot API Failed", err);

    return {
      spotPrices: {},
    };

  }

}

/* ============================================================
   Scanner
============================================================ */

export async function getOptions({

  symbols,

  expiry,

  mode = "all",

}) {

  const payload = {
    mode,
  };

  if (symbols && symbols.length) {
    payload.symbols = symbols;
  }

  if (expiry) {
    payload.expiry = expiry;
  }

  try {

    const { data } = await API.post(
      "/instruments/options",
      payload
    );

    return data;

  } catch (err) {

    console.warn(
      "Scanner API failed. Retrying..."
    );

    const { data } = await API.post(
      "/instruments/options",
      payload
    );

    return data;

  }

}

/* ============================================================
   Average Volume
============================================================ */

export async function getAverageVolume(symbols) {

  try {

    const { data } = await API.post(
      "/instruments/avgvol",
      {
        symbols,
      }
    );

    return data;

  } catch {

    return {};

  }

}

/* ============================================================
   Quote API
============================================================ */

export async function getQuote(payload) {

  const { data } = await API.post(
    "/market/quote",
    payload
  );

  return data;

}

/* ============================================================
   Debug Contract
============================================================ */

export async function debugContract(payload) {

  const { data } = await API.post(
    "/debug/contract",
    payload
  );

  return data;

}

/* ============================================================
   Manual Scanner Refresh
============================================================ */

export async function refreshScanner() {

  const { data } = await API.post(
    "/scanner/refresh"
  );

  return data;

}

/* ============================================================
   Equity Volume Surge
============================================================ */

export async function getEquityVolumeSurge() {
  const { data } = await API.get("/equity/volume-surge");
  return data;
}

/* ============================================================
   Scanner API (Future)
============================================================ */

export async function getScanner() {

  const { data } = await API.get(
    "/scanner"
  );

  return data;

}

/* ============================================================
   Default Export
============================================================ */

export default API;