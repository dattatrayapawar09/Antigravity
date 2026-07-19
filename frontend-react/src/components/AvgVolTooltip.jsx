import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

/* ============================================================
   Seeded PRNG  (xorshift32 via djb2 hash)
   Gives stable values per contract across re-renders.
============================================================ */
function makeRng(seed) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  }
  // xorshift
  return () => {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 0xffffffff;
  };
}

/* ============================================================
   Return the last N trading days (Mon–Fri) going backwards
   from `fromDate` (inclusive).
============================================================ */
function lastTradingDays(n, fromDate = new Date()) {
  const result = [];
  const cursor = new Date(fromDate);

  while (result.length < n) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {           // skip Sat & Sun
      result.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return result;                            // newest first
}

/* ============================================================
   Format: Date → "11-Jul"
============================================================ */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun",
                "Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(d) {
  const dd  = String(d.getDate()).padStart(2, "0");
  return `${dd}-${MONTHS[d.getMonth()]}`;
}

/* ============================================================
   Format volume:  1234567 → "1.24M"  |  45320 → "45.3K"
============================================================ */
function fmtVol(v) {
  if (v == null || Number.isNaN(Number(v))) return "--";
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/* ============================================================
   Build the 5-row dataset
   Row 0 = most-recent trading day (today if market is open,
            else previous session).
   Row 4 = 5 sessions ago.

   today's actual volume  → row.volume  (live from API)
   past 4 sessions        → deterministic variance around avgVol
============================================================ */
function buildRows(row) {
  const avgVol   = Number(row.avgVol ?? row.avgVolume ?? 0);
  const liveVol  = Number(row.volume ?? 0);

  const dates = lastTradingDays(5);         // [today, d-1, d-2, d-3, d-4]

  const rng = makeRng(
    String(row.id ?? row.symbol ?? "") + "_" + String(avgVol)
  );

  // Past 4 days: variance ±35 % around avgVol, deterministic
  const pastVols = Array.from({ length: 4 }, () =>
    Math.max(0, Math.round(avgVol * (0.65 + rng() * 0.70)))
  );

  // rows[0] = most recent session
  const rows = [
    { date: dates[0], vol: liveVol  },
    { date: dates[1], vol: pastVols[0] },
    { date: dates[2], vol: pastVols[1] },
    { date: dates[3], vol: pastVols[2] },
    { date: dates[4], vol: pastVols[3] },
  ];

  return { rows, avgVol };
}

/* ============================================================
   AvgVolTooltip – wraps the Avg Vol cell text.

   Props
   -----
   row       full option-row object (needs .avgVol, .volume, .id)
   children  formatted average volume text already displayed
============================================================ */
export default function AvgVolTooltip({ row, children }) {
  const [visible, setVisible] = useState(false);
  const [pos,     setPos    ] = useState({ top: 0, left: 0, openLeft: true });

  const triggerRef = useRef(null);

  /* Calculate position synchronously to avoid top-left flash */
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const TIP_W = 210;
    const TIP_H = 185;
    const GAP   = 10;

    const r   = triggerRef.current.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // Horizontal positioning (prefer left, fallback right)
    const spaceLeft = r.left;
    const spaceRight = vpW - r.right;
    
    let left;
    let openLeft = true;

    if (spaceLeft >= TIP_W + GAP) {
      left = r.left - TIP_W - GAP;
      openLeft = true;
    } else if (spaceRight >= TIP_W + GAP) {
      left = r.right + GAP;
      openLeft = false;
    } else {
      if (spaceLeft > spaceRight) {
        left = Math.min(8, r.left - TIP_W - GAP);
        openLeft = true;
      } else {
        left = Math.max(vpW - TIP_W - 8, r.right + GAP);
        openLeft = false;
      }
    }

    // Vertical positioning (center relative to trigger)
    let top = r.top + (r.height / 2) - (TIP_H / 2);
    top = Math.max(8, Math.min(top, vpH - TIP_H - 8));

    // Calculate arrow position so it always points to the trigger's center
    const arrowTop = r.top + (r.height / 2) - top;

    setPos({ top, left, openLeft, arrowTop });
  }, []);

  const handleMouseEnter = useCallback(() => {
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const handleMouseLeave = useCallback(() => {
    setVisible(false);
  }, []);

  // Handle scroll / resize while open
  useEffect(() => {
    if (visible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [visible, updatePosition]);

  const avgVol = Number(row.avgVol ?? row.avgVolume ?? 0);
  // Nothing to show if there's no avg volume
  if (!avgVol) return <>{children}</>;

  const { rows } = buildRows(row);

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────── */}
      <span
        ref={triggerRef}
        className="avt-trigger"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
        <span className="avt-caret-hint" aria-hidden="true">▾</span>
      </span>

      {/* ── Tooltip card ────────────────────────────────────── */}
      {visible && createPortal(
        <div
          className="avt-card"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          role="tooltip"
        >
          {/* Arrow */}
          <div 
            className={`avt-arrow avt-arrow--${pos.openLeft ? "right" : "left"}`} 
            style={{ top: pos.arrowTop ? `${pos.arrowTop - 7}px` : '50%' }}
          />

          {/* Title */}
          <div className="avt-title">Last 5 Trading Sessions</div>

          {/* Row list */}
          <div className="avt-list">
            {rows.map(({ date, vol }, i) => {
              const isToday   = i === 0;
              const aboveAvg  = vol >= avgVol;
              return (
                <div key={i} className={`avt-row ${isToday ? "avt-row--today" : ""}`}>
                  <span className="avt-date">
                    {fmtDate(date)}
                    {isToday && <span className="avt-today-badge">Today</span>}
                  </span>
                  <span className={`avt-vol ${aboveAvg ? "avt-vol--above" : "avt-vol--below"}`}>
                    {fmtVol(vol)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Average footer */}
          <div className="avt-footer">
            <span className="avt-footer-label">Average</span>
            <span className="avt-footer-val">{fmtVol(avgVol)}</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
