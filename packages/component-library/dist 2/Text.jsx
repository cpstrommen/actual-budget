import React, { forwardRef } from 'react';
import { css, cx } from '@emotion/css';
import { componentSizeText, sizeResponsiveStyles, } from './tokens';
// Per-size typography, varying by breakpoint via media queries (no
// hooks). Precomputed once at module level so rendering stays cheap.
const getTextSizeStyles = (size) => {
    const text = componentSizeText[size];
    const getGroupStyles = (group) => {
        const { fontSize, lineHeight } = text[group];
        return { fontSize, lineHeight };
    };
    return sizeResponsiveStyles({
        narrow: getGroupStyles('narrow'),
        small: getGroupStyles('small'),
        medium: getGroupStyles('medium'),
        wide: getGroupStyles('wide'),
    });
};
const textSizeStyles = {
    small: getTextSizeStyles('small'),
    medium: getTextSizeStyles('medium'),
    large: getTextSizeStyles('large'),
    'extra-large': getTextSizeStyles('extra-large'),
};
export const Text = forwardRef((props, ref) => {
    const { className = '', style, innerRef, size, ...restProps } = props;
    return (<span {...restProps} ref={innerRef ?? ref} className={size
            ? cx(className, css({ ...textSizeStyles[size], ...style }))
            : cx(className, css(style))}/>);
});
Text.displayName = 'Text';
