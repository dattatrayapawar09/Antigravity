// analytics.js

export function calculateMetrics(option) {

    const priceChg =
        option.price - option.prevPrice;

    const oiChg =
        option.oi - option.prevOi;

    const oiChgPct =
        option.prevOi > 0
            ? (oiChg / option.prevOi) * 100
            : 0;

    const safeAvgVol =
        option.avgVol > 0
            ? option.avgVol
            : Math.max(1, option.volume || 1);

    const volRatio =
        option.volume / safeAvgVol;

    let signal = 'Neutral';
    let signalClass = '';
    let icon = '';

    if (option.type === 'CE') {

        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bullish Buildup';
            signalClass = 'signal-bullish-buildup';
            icon = 'arrow-up-right';
        }

    } else {

        if (oiChg > 0 && volRatio > 1.5 && priceChg > 0) {
            signal = 'Bearish Buildup';
            signalClass = 'signal-bearish-buildup';
            icon = 'arrow-down-right';
        }
    }

    let strength = Math.min(
        100,
        (volRatio * 10) +
        (Math.abs(oiChgPct) * 2)
    );

    return {
        ...option,
        priceChg,
        oiChgPct,
        volRatio,
        signal,
        signalClass,
        icon,
        strength
    };
}
