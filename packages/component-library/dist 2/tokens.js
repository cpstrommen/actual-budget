var BreakpointNames;
(function (BreakpointNames) {
    BreakpointNames["small"] = "small";
    BreakpointNames["medium"] = "medium";
    BreakpointNames["wide"] = "wide";
})(BreakpointNames || (BreakpointNames = {}));
export const breakpoints = {
    small: 512,
    medium: 730,
    wide: 1100,
};
// Provide the same breakpoints in a form usable by CSS media queries
// {
//   breakpoint_small: '512px',
//   breakpoint_medium: '740px',
//   breakpoint_wide: '1100px',
// }
export const tokens = Object.entries(breakpoints).reduce((acc, [key, val]) => ({
    ...acc,
    [`breakpoint_${key}`]: `${val}px`,
}), {});
export const spacing = {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
};
export const radius = {
    sm: 4,
    sheet: 18,
    pill: 999,
};
const breakpointGroupMediaQueries = {
    small: `@media (min-width: ${tokens.breakpoint_small})`,
    medium: `@media (min-width: ${tokens.breakpoint_medium})`,
    wide: `@media (min-width: ${tokens.breakpoint_wide})`,
};
// Typographic scale, aligned with styles.ts (smallText 13, mediumText 15,
// verySmallText 12, mobileMenuItem 17). Mobile steps sizes up one notch
// for readability; desktop stays compact.
export const componentSizeText = {
    small: {
        narrow: { fontSize: 12, lineHeight: '16px' },
        small: { fontSize: 12, lineHeight: '16px' },
        medium: { fontSize: 12, lineHeight: '16px' },
        wide: { fontSize: 12, lineHeight: '16px' },
    },
    medium: {
        narrow: { fontSize: 13, lineHeight: '18px' },
        small: { fontSize: 13, lineHeight: '18px' },
        medium: { fontSize: 13, lineHeight: '18px' },
        wide: { fontSize: 13, lineHeight: '18px' },
    },
    large: {
        narrow: { fontSize: 16, lineHeight: '22px' },
        small: { fontSize: 15, lineHeight: '20px' },
        medium: { fontSize: 15, lineHeight: '20px' },
        wide: { fontSize: 15, lineHeight: '20px' },
    },
    'extra-large': {
        narrow: { fontSize: 17, lineHeight: '24px' },
        small: { fontSize: 17, lineHeight: '24px' },
        medium: { fontSize: 16, lineHeight: '22px' },
        wide: { fontSize: 16, lineHeight: '22px' },
    },
};
// Padding and min-height for controls (Button, Input). The `medium` row
// reproduces today's default look exactly (5px / 5px 10px, no
// min-height). `extra-large` narrow hits the 40px mobile touch target.
export const componentSizeControl = {
    small: {
        narrow: { paddingY: 3, paddingX: spacing.sm, minHeight: 24 },
        small: { paddingY: 3, paddingX: spacing.sm, minHeight: 24 },
        medium: { paddingY: 3, paddingX: spacing.sm, minHeight: 24 },
        wide: { paddingY: 3, paddingX: spacing.sm, minHeight: 24 },
    },
    medium: {
        narrow: { paddingY: 5, paddingX: 10 },
        small: { paddingY: 5, paddingX: 10 },
        medium: { paddingY: 5, paddingX: 10 },
        wide: { paddingY: 5, paddingX: 10 },
    },
    large: {
        narrow: { paddingY: spacing.sm, paddingX: spacing.md, minHeight: 36 },
        small: { paddingY: 6, paddingX: spacing.md, minHeight: 32 },
        medium: { paddingY: 6, paddingX: spacing.md, minHeight: 32 },
        wide: { paddingY: 6, paddingX: spacing.md, minHeight: 32 },
    },
    'extra-large': {
        narrow: { paddingY: 10, paddingX: 14, minHeight: 40 },
        small: { paddingY: spacing.sm, paddingX: spacing.md, minHeight: 36 },
        medium: { paddingY: spacing.sm, paddingX: spacing.md, minHeight: 36 },
        wide: { paddingY: spacing.sm, paddingX: spacing.md, minHeight: 36 },
    },
};
// Flattens a per-breakpoint-group value table into a single emotion style
// object: the `narrow` values become the base and each larger group is
// emitted as a min-width media query — but only when its values actually
// differ from the previous group, keeping generated CSS lean.
export function sizeResponsiveStyles(values) {
    const styles = { ...values.narrow };
    let previousGroup = 'narrow';
    for (const group of ['small', 'medium', 'wide']) {
        if (JSON.stringify(values[group]) !== JSON.stringify(values[previousGroup])) {
            styles[breakpointGroupMediaQueries[group]] = values[group];
        }
        previousGroup = group;
    }
    return styles;
}
