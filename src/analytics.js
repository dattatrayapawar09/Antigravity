// analytics.js
// Calculates all option metrics and signal strength

import { state } from './state.js';

export function calculateMetrics(option) {

    const price = Number(option.price) || 0;
    const prevPrice = Number(option.prevPrice) || price;

    const oi = Number(option.oi) || 0;
    const prevOi = Number(option.prevOi) || oi;

    const volume = Number(option.volume) || 0;

    const avgVol =
        Number(option.avgVol) ||
        Number(option.previousSessionVolume) ||
        volume ||
        1;

    const iv = Number(option.iv) || 0;

    const bid = Number(option.bid) || 0;
    const ask = Number(option.ask) || 0;

    const spread =
        option.spread !== undefined
            ? Number(option.spread)
            : Math.max(0, ask - bid);

    const priceChg = price - prevPrice;
    const priceChgPct =
        prevPrice > 0
            ? ((price - prevPrice) / prevPrice) * 100
            : 0;

    const oiChg = oi - prevOi;

    const oiChgPct =
        prevOi > 0
            ? ((oi - prevOi) / prevOi) * 100
            : 0;

    const safeAvg = Math.max(avgVol, 1);

    const volRatio = volume / safeAvg;

    const threshold =
        Number(state.filters.volRatio) || 1;

    let signal = "Neutral";
    let signalClass = "signal-neutral";

    if (volRatio >= threshold) {

        if (priceChg > 0 && oiChg > 0) {

            signal =
                option.type === "CE"
                    ? "Long Buildup"
                    : "Bearish Buildup";

            signalClass =
                option.type === "CE"
                    ? "signal-bull"
                    : "signal-bear";
        }

        else if (priceChg < 0 && oiChg > 0) {

            signal = "Short Buildup";
            signalClass = "signal-bear";
        }

        else if (priceChg > 0 && oiChg < 0) {

            signal = "Short Covering";
            signalClass = "signal-bull";
        }

        else if (priceChg < 0 && oiChg < 0) {

            signal = "Long Unwinding";
            signalClass = "signal-bear";
        }

    }

    //-------------------------------------------------------
    // Signal Strength
    //-------------------------------------------------------

    const volumeScore =
        Math.min(
            45,
            volRatio * 12
        );

    const oiScore =
        Math.min(
            25,
            Math.abs(oiChgPct)
        );

    const ivScore =
        Math.min(
            15,
            iv / 2
        );

    const priceScore =
        Math.min(
            15,
            Math.abs(priceChgPct)
        );

    const strength = Math.min(
        100,
        Math.round(
            volumeScore +
            oiScore +
            ivScore +
            priceScore
        )
    );

    //-------------------------------------------------------
    // Return
    //-------------------------------------------------------

    return {

        ...option,

        price,
        prevPrice,

        priceChg,
        priceChgPct,

        oi,
        prevOi,

        oiChg,
        oiChgPct,

        volume,

        avgVol,

        volRatio,

        iv,

        bid,

        ask,

        spread,

        signal,

        signalClass,

        strength
    };
}
