import React, { forwardRef } from 'react';
import { css, cx } from '@emotion/css';
export const viewStyles = css({
    alignItems: 'stretch',
    borderWidth: 0,
    borderStyle: 'solid',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    position: 'relative',
    /* fix flexbox bugs */
    minHeight: 0,
    minWidth: 0,
});
export const View = forwardRef((props, ref) => {
    const { className = '', style, nativeStyle, innerRef, ...restProps } = props;
    return (<div {...restProps} ref={innerRef ?? ref} style={nativeStyle} className={cx(viewStyles, className, style && Object.keys(style).length > 0 ? css(style) : undefined)}/>);
});
View.displayName = 'View';
