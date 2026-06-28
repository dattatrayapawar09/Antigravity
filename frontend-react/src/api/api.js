import axios from "axios";

/*
|--------------------------------------------------------------------------
| Axios Instance
|--------------------------------------------------------------------------
*/

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
*/

API.interceptors.request.use(
  (config) => {
    console.log(
      `[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`
    );
    return config;
  },
  (error) => Promise.reject(error)
);

/*
|--------------------------------------------------------------------------
| Response Logger
|--------------------------------------------------------------------------
*/

API.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(
      "[API ERROR]",
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

export async function pingBackend() {
  try {
    const { data } = await API.get("/health");
    return data;
  } catch {
    return {
      status: "offline",
    };
  }
}

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

export async function getDashboard() {
  const { data } = await API.get("/dashboard");
  return data;
}

/*
|--------------------------------------------------------------------------
| Spot Prices
|--------------------------------------------------------------------------
*/

export async function getSpotPrices(symbols) {
  const { data } = await API.post("/instruments/spot", {
    symbols,
  });

  return data;
}

/*
|--------------------------------------------------------------------------
| Scanner
|--------------------------------------------------------------------------
*/

export async function getOptions({
  symbols = [],
  expiry = null,
  mode = "all",
}) {
  const { data } = await API.post(
    "/instruments/options",
    {
      symbols,
      expiry,
      mode,
    }
  );

  return data;
}

/*
|--------------------------------------------------------------------------
| Average Volume
|--------------------------------------------------------------------------
*/

export async function getAverageVolume(symbols) {
  const { data } = await API.post(
    "/instruments/avgvol",
    {
      symbols,
    }
  );

  return data;
}

export default API;