// analytics.js

import { state } from './state.js';

export function calculateMetrics(option) {

    const price =
        Number(option.price) || 0;

    const prevPrice =
        Number(option.prevPrice) || price;

    const oi =
        Number(option.oi) || 0;

    const prevOi =
        Number(option.prevOi) || 0;

    const volume =
        Number(option.volume) || 0;

    const avgVol =
        Number(option.avgVol) || 0;

    const iv =
        Number(option.iv) || 0;

    const priceChg =
        price - prevPrice;

    const oiChg =
        oi - prevOi;

    const oiChgPct =
        prevOi > 0
            ? ((oi - prevOi) / prevOi) * 100
            : 0;

    const safeAvgVol =
        avgVol > 0
            ? avgVol
            : Math.max(volume, 1);

    const volRatio =
        volume / safeAvgVol;

    const threshold =
        Number(state.filters.volRatio) || 1.5;

    let signal = 'Neutral';
    let signalClass = 'signal-neutral';

    if (priceChg > 0 && oiChg > 0) {

        signal =
            option.type === 'CE'
                ? 'Long Buildup'
                : 'Bearish Buildup';

        signalClass =
            option.type === 'CE'
                ? 'signal-bull'
                : 'signal-bear';
    }

    else if (priceChg < 0 && oiChg > 0) {

        signal = 'Short Buildup';
        signalClass = 'signal-bear';
    }

    else if (priceChg > 0 && oiChg < 0) {

        signal = 'Short Covering';
        signalClass = 'signal-bull';
    }

    else if (priceChg < 0 && oiChg < 0) {

        signal = 'Long Unwinding';
        signalClass = 'signal-bear';
    }

    // Volume threshold filter
    if (volRatio < threshold) {
        signal = 'Neutral';
        signalClass = 'signal-neutral';
    }

    // Signal strength scoring
    const volumeScore =
        Math.min(
            50,
            volRatio * 8
        );

    const oiScore =
        Math.min(
            30,
            Math.abs(oiChgPct)
        );

    const ivScore =
        Math.min(
            20,
            iv
        );

    const strength =
        Math.min(
            100,
            Math.round(
                volumeScore +
                oiScore +
                ivScore
            )
        );

    return {
        ...option,

        price,
        prevPrice,

        oi,
        prevOi,

        volume,
        avgVol,

        iv,

        priceChg,
        oiChg,

        oiChgPct,

        volRatio,

        signal,
        signalClass,

        strength
    };
}
