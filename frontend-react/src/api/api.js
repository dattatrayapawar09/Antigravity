import axios from "axios";

/*
|--------------------------------------------------------------------------
| Backend Configuration
|--------------------------------------------------------------------------
*/

const API = axios.create({
  baseURL: "http://localhost:8000/api",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

/*
|--------------------------------------------------------------------------
| Request Interceptor
|--------------------------------------------------------------------------
*/

API.interceptors.request.use(
  (config) => {
    console.log(
      `[API] ${config.method?.toUpperCase()} ${config.url}`
    );

    return config;
  },
  (error) => Promise.reject(error)
);

/*
|--------------------------------------------------------------------------
| Response Interceptor
|--------------------------------------------------------------------------
*/

API.interceptors.response.use(
  (response) => response,

  (error) => {
    console.error("[API ERROR]", error);

    return Promise.reject(error);
  }
);

/*
|--------------------------------------------------------------------------
| Market APIs
|--------------------------------------------------------------------------
*/

export const getSpotPrices = async (symbols) => {

  const { data } = await API.post("/instruments/spot", {
    symbols,
  });

  return data;
};

/*
|--------------------------------------------------------------------------
| Scanner APIs
|--------------------------------------------------------------------------
*/

export const getOptions = async (
  symbols,
  expiry = null,
  mode = "stocks"
) => {

  const { data } = await API.post("/instruments/options", {
    symbols,
    expiry,
    mode,
  });

  return data;
};

/*
|--------------------------------------------------------------------------
| Average Volume
|--------------------------------------------------------------------------
*/

export const getAverageVolume = async (symbols) => {

  const { data } = await API.post(
    "/instruments/avgvol",
    {
      symbols,
    }
  );

  return data;
};

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

export const pingBackend = async () => {

  try {

    await API.get("/");

    return true;

  } catch {

    return false;

  }

};

export default API;
