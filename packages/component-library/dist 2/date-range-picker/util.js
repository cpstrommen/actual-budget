import { endOfMonth, getLocalTimeZone, parseDate, today, } from '@internationalized/date';
// Whether a value is day-shaped (`yyyy-MM-dd`) rather than month-shaped
// (`yyyy-MM`).
export function valueIsDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match)
        return false;
    const month = Number(match[2]);
    const day = Number(match[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}
// Clamp an ISO date string to [min, max]; all three must share a granularity.
export function clamp(value, min, max) {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
}
export function rangePosition(cell, start, end) {
    if (cell < start || cell > end)
        return null;
    if (cell === start)
        return 'start';
    if (cell === end)
        return 'end';
    return 'middle';
}
// Plain string date helpers — the small loot-core/date-fns subset the picker
// needs, since the library can depend on neither. Built on Intl and the
// already-present `@internationalized/date`; values are local dates, never
// timezone-shifted.
function toDate(value) {
    const [year, month = 1, day = 1] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}
// Intl.DateTimeFormat construction is expensive and the picker uses only a
// handful of (locale, options) shapes, so cache the formatters.
const formatters = new Map();
export function formatDate(value, locale, options) {
    const key = `${locale}|${JSON.stringify(options)}`;
    let formatter = formatters.get(key);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(locale, options);
        formatters.set(key, formatter);
    }
    return formatter.format(toDate(value));
}
export function getYear(value) {
    return value.slice(0, 4);
}
export function getMonth(value) {
    return value.slice(0, 7);
}
export function firstDayOfMonth(value) {
    return `${getMonth(value)}-01`;
}
export function lastDayOfMonth(value) {
    return endOfMonth(parseDate(firstDayOfMonth(value))).toString();
}
export function currentDay() {
    return today(getLocalTimeZone()).toString();
}
export function currentMonth() {
    return getMonth(currentDay());
}
export function monthFromIndex(year, index) {
    return `${year}-${String(index + 1).padStart(2, '0')}`;
}
