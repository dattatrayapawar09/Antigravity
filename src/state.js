// state.js

export const state = {
    apiConnected: false,
    liveSpotCache: {},
    marketData: [],
    selectedUniverse: [],
    currentInsightId: null,
    chartInstance: null,
    updateInterval: null,

    filters: {
        assetClass: 'INDEX',
        volRatio: 1.0,
        oiChg: 0,
        type: 'ALL',
        expiry: 'ALL'
    }
};
