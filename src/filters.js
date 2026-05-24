// filters.js

import { state } from './state.js';

export function applyFilters(data) {

    return data.filter(d => {

        if (
            !state.selectedUniverse.includes(d.symbol)
        ) return false;

        if (
            d.volRatio < state.filters.volRatio
        ) return false;

        if (
            state.filters.type !== 'ALL' &&
            d.type !== state.filters.type
        ) return false;

        if (
            state.filters.expiry !== 'ALL' &&
            d.expiry !== state.filters.expiry
        ) return false;

        return true;
    });
}
