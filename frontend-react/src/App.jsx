import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import {
  lazy,
  Suspense,
  useEffect,
} from "react";

import { useLocation } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import Loading from "./components/Loading";

import "./App.css";

/* ============================================================
   Lazy Loaded Pages
============================================================ */

const Dashboard = lazy(() =>
  import("./pages/Dashboard")
);

const IndexOptions = lazy(() =>
  import("./pages/IndexOptions")
);

const StockOptions = lazy(() =>
  import("./pages/StockOptions")
);

const AllScanner = lazy(() =>
  import("./pages/AllScanner")
);

const EquityVolumeSurge = lazy(() =>
  import("./pages/EquityVolumeSurge")
);

const SmartReversal = lazy(() =>
  import("./pages/SmartReversal")
);

const SmartReversalOptions = lazy(() =>
  import("./pages/SmartReversalOptions")
);

const Watchlist = lazy(() =>
  import("./pages/Watchlist")
);

const Settings = lazy(() =>
  import("./pages/Settings")
);

/* ============================================================
   Scroll To Top
============================================================ */

function ScrollToTop() {

  const { pathname } = useLocation();

  useEffect(() => {

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

  }, [pathname]);

  return null;

}

/* ============================================================
   App
============================================================ */

function App() {

  return (

    <>

      <ScrollToTop />

      <MainLayout>

        <Suspense fallback={<Loading />}>

          <Routes>

            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/index"
              element={<IndexOptions />}
            />

            <Route
              path="/stocks"
              element={<StockOptions />}
            />

            <Route
              path="/scanner"
              element={<AllScanner />}
            />

            <Route
              path="/equity-volume-surge"
              element={<EquityVolumeSurge />}
            />

            <Route
              path="/smart-reversal"
              element={<SmartReversal />}
            />

            <Route
              path="/smart-reversal-options"
              element={<SmartReversalOptions />}
            />

            <Route
              path="/watchlist"
              element={<Watchlist />}
            />

            <Route
              path="/settings"
              element={<Settings />}
            />

            {/* Redirect Unknown Routes */}

            <Route
              path="*"
              element={
                <Navigate
                  to="/"
                  replace
                />
              }
            />

          </Routes>

        </Suspense>

      </MainLayout>

    </>

  );

}

export default App;