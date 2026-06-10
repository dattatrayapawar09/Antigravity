// analytics.js

export function calculateMetrics(option) {

    const price     = Number(option.price)     || 0;
    const prevPrice = Number(option.prevPrice) || price;
    const oi        = Number(option.oi)        || 0;
    const prevOi    = Number(option.prevOi)    || 0;
    const volume    = Number(option.volume)    || 0;
    const avgVol    = Number(option.avgVol)    || 0;

    const priceChg  = price - prevPrice;
    const oiChg     = oi - prevOi;

    const oiChgPct  = prevOi > 0
        ? (oiChg / prevOi) * 100
        : 0;

    // Avoid divide-by-zero: if avgVol is 0, use volume itself → ratio = 1.0
    const safeAvgVol = avgVol > 0 ? avgVol : Math.max(1, volume);
    const volRatio   = volume / safeAvgVol;

    // ── Signal Detection ─────────────────────────────────────────────────────
    let signal      = 'Neutral';
    let signalClass = 'signal-neutral';

    if (option.type === 'CE') {
        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bullish Buildup'; signalClass = 'signal-bull';
        } else if (oiChg < 0 && volRatio > 1.2 && priceChg > 0) {
            signal = 'Short Covering';  signalClass = 'signal-bull';
        } else if (oiChg < 0 && priceChg < 0) {
            signal = 'Long Unwinding';  signalClass = 'signal-bear';
        }
    } else {
        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bearish Buildup'; signalClass = 'signal-bear';
        } else if (oiChg < 0 && volRatio > 1.2 && priceChg > 0) {
            signal = 'Short Covering';  signalClass = 'signal-bull';
        } else if (oiChg < 0 && priceChg < 0) {
            signal = 'Long Unwinding';  signalClass = 'signal-bear';
        }
    }

    const strength = Math.min(100, Math.round((volRatio * 10) + (Math.abs(oiChgPct) * 2)));

    return {
        ...option,
        price, prevPrice, oi, prevOi, volume, avgVol,
        priceChg,
        oiChgPct,
        volRatio,
        signal,
        signalClass,
        strength
    };
}
