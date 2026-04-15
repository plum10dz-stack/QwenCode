"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fuzzyMatch = fuzzyMatch;
exports.containsMatch = containsMatch;
exports.startsWithMatch = startsWithMatch;
exports.applySearch = applySearch;
function hlText(text, indices) {
    const set = new Set(indices);
    return text
        .split('')
        .map((c, i) => (set.has(i) ? `<span class="ss-hl">${c}</span>` : c))
        .join('');
}
function fuzzyMatch(text, query) {
    if (!query)
        return { match: true, hl: String(text) };
    const textStr = String(text);
    const tl = textStr.toLowerCase();
    const ql = query.toLowerCase();
    let ti = 0;
    let qi = 0;
    const indices = [];
    while (ti < tl.length && qi < ql.length) {
        if (tl[ti] === ql[qi]) {
            indices.push(ti);
            qi++;
        }
        ti++;
    }
    if (qi < ql.length)
        return { match: false };
    return { match: true, hl: hlText(textStr, indices) };
}
function containsMatch(text, query) {
    if (!query)
        return { match: true, hl: String(text) };
    const textStr = String(text);
    const tl = textStr.toLowerCase();
    const ql = query.toLowerCase();
    const idx = tl.indexOf(ql);
    if (idx === -1)
        return { match: false };
    return {
        match: true,
        hl: hlText(textStr, Array.from({ length: query.length }, (_, i) => idx + i)),
    };
}
function startsWithMatch(text, query) {
    if (!query)
        return { match: true, hl: String(text) };
    const textStr = String(text);
    const tl = textStr.toLowerCase();
    const ql = query.toLowerCase();
    if (!tl.startsWith(ql))
        return { match: false };
    return {
        match: true,
        hl: hlText(textStr, Array.from({ length: query.length }, (_, i) => i)),
    };
}
function applySearch(text, query, mode) {
    if (!query)
        return { match: true, hl: String(text) };
    switch (mode) {
        case 'fuzzy':
            return fuzzyMatch(text, query);
        case 'startswith':
            return startsWithMatch(text, query);
        default:
            return containsMatch(text, query);
    }
}
// function hlText(text, indices) {
//   const set = new Set(indices)
//   return text.split('').map((c, i) => set.has(i) ? `<span class="ss-hl">${c}</span>` : c).join('')
// }
// export function fuzzyMatch(text, query) {
//   if (!query) return { match: true, hl: text }
//   const tl = String(text).toLowerCase(), ql = query.toLowerCase()
//   let ti = 0, qi = 0, indices = []
//   while (ti < tl.length && qi < ql.length) {
//     if (tl[ti] === ql[qi]) { indices.push(ti); qi++ }
//     ti++
//   }
//   if (qi < ql.length) return { match: false }
//   return { match: true, hl: hlText(text, indices) }
// }
// export function containsMatch(text, query) {
//   if (!query) return { match: true, hl: String(text) }
//   const tl = String(text).toLowerCase(), ql = query.toLowerCase()
//   const idx = tl.indexOf(ql)
//   if (idx === -1) return { match: false }
//   return { match: true, hl: hlText(text, Array.from({ length: query.length }, (_, i) => idx + i)) }
// }
// export function startsWithMatch(text, query) {
//   if (!query) return { match: true, hl: String(text) }
//   const tl = String(text).toLowerCase(), ql = query.toLowerCase()
//   if (!tl.startsWith(ql)) return { match: false }
//   return { match: true, hl: hlText(text, Array.from({ length: query.length }, (_, i) => i)) }
// }
// export function applySearch(text, query, mode) {
//   if (!query) return { match: true, hl: String(text) }
//   switch (mode) {
//     case 'fuzzy':      return fuzzyMatch(text, query)
//     case 'startswith': return startsWithMatch(text, query)
//     default:           return containsMatch(text, query)
//   }
// }
