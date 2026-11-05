import React, { forwardRef, useMemo } from 'react';
import { Button as ReactAriaButton } from 'react-aria-components';
import { css, cx } from '@emotion/css';
import { AnimatedLoading } from './icons/AnimatedLoading';
import { styles } from './styles';
import { theme } from './theme';
import { componentSizeControl, componentSizeText, sizeResponsiveStyles, } from './tokens';
import { View } from './View';
const backgroundColor = {
    normal: theme.buttonNormalBackground,
    normalDisabled: theme.buttonNormalDisabledBackground,
    primary: theme.buttonPrimaryBackground,
    primaryDisabled: theme.buttonPrimaryDisabledBackground,
    bare: theme.buttonBareBackground,
    bareDisabled: theme.buttonBareDisabledBackground,
    menu: theme.buttonMenuBackground,
    menuSelected: theme.buttonMenuSelectedBackground,
};
const backgroundColorHover = {
    normal: theme.buttonNormalBackgroundHover,
    primary: theme.buttonPrimaryBackgroundHover,
    bare: theme.buttonBareBackgroundHover,
    menu: theme.buttonMenuBackgroundHover,
    menuSelected: theme.buttonMenuSelectedBackgroundHover,
    normalDisabled: 'transparent',
    primaryDisabled: 'transparent',
    bareDisabled: 'transparent',
    menuDisabled: 'transparent',
    menuSelectedDisabled: 'transparent',
};
const borderColor = {
    normal: theme.buttonNormalBorder,
    normalDisabled: theme.buttonNormalDisabledBorder,
    primary: theme.buttonPrimaryBorder,
    primaryDisabled: theme.buttonPrimaryDisabledBorder,
    menu: theme.buttonMenuBorder,
    menuSelected: theme.buttonMenuSelectedBorder,
};
const textColor = {
    normal: theme.buttonNormalText,
    normalDisabled: theme.buttonNormalDisabledText,
    primary: theme.buttonPrimaryText,
    primaryDisabled: theme.buttonPrimaryDisabledText,
    bare: theme.buttonBareText,
    bareDisabled: theme.buttonBareDisabledText,
    menu: theme.buttonMenuText,
    menuSelected: theme.buttonMenuSelectedText,
};
const textColorHover = {
    normal: theme.buttonNormalTextHover,
    primary: theme.buttonPrimaryTextHover,
    bare: theme.buttonBareTextHover,
    menu: theme.buttonMenuTextHover,
    menuSelected: theme.buttonMenuSelectedTextHover,
};
const _getBorder = (variant, variantWithDisabled) => {
    switch (variant) {
        case 'bare':
            return 'none';
        default:
            return '1px solid ' + borderColor[variantWithDisabled];
    }
};
const _getPadding = (variant) => {
    switch (variant) {
        case 'bare':
            return '5px';
        default:
            return '5px 10px';
    }
};
const _getHoveredStyles = (variant) => ({
    ...(variant !== 'bare' && styles.shadow),
    backgroundColor: backgroundColorHover[variant],
    color: textColorHover[variant],
    cursor: 'pointer',
});
const _getActiveStyles = (variant, bounce) => {
    switch (variant) {
        case 'bare':
            return { backgroundColor: theme.buttonBareBackgroundActive };
        default:
            return {
                transform: bounce ? 'translateY(1px)' : undefined,
                boxShadow: `0 1px 4px 0 ${variant === 'primary'
                    ? theme.buttonPrimaryShadow
                    : theme.buttonNormalShadow}`,
                transition: 'none',
            };
    }
};
// Builds the padding/typography overrides for an explicit `size`, varying
// by breakpoint via media queries (no per-instance hooks). Bare buttons
// use uniform padding; framed buttons use the paddingX/paddingY split.
const getButtonSizeOverrides = (size, isBare) => {
    const control = componentSizeControl[size];
    const text = componentSizeText[size];
    const getGroupStyles = (group) => {
        const { paddingY, paddingX, minHeight } = control[group];
        const { fontSize, lineHeight } = text[group];
        return {
            padding: isBare ? `${paddingY}px` : `${paddingY}px ${paddingX}px`,
            ...(minHeight != null ? { minHeight } : null),
            fontSize,
            // Medium matches today's default look, which inherits line-height;
            // only the other sizes force their scale line-height.
            ...(size === 'medium' ? {} : { lineHeight }),
        };
    };
    return sizeResponsiveStyles({
        narrow: getGroupStyles('narrow'),
        small: getGroupStyles('small'),
        medium: getGroupStyles('medium'),
        wide: getGroupStyles('wide'),
    });
};
const buttonSizeOverrides = {
    small: {
        bare: getButtonSizeOverrides('small', true),
        framed: getButtonSizeOverrides('small', false),
    },
    medium: {
        bare: getButtonSizeOverrides('medium', true),
        framed: getButtonSizeOverrides('medium', false),
    },
    large: {
        bare: getButtonSizeOverrides('large', true),
        framed: getButtonSizeOverrides('large', false),
    },
    'extra-large': {
        bare: getButtonSizeOverrides('extra-large', true),
        framed: getButtonSizeOverrides('extra-large', false),
    },
};
export const Button = forwardRef((props, ref) => {
    const { children, variant = 'normal', bounce = true, size, ...restProps } = props;
    const variantWithDisabled = props.isDisabled ? `${variant}Disabled` : variant;
    const sizeOverrides = size
        ? buttonSizeOverrides[size][variant === 'bare' ? 'bare' : 'framed']
        : null;
    const defaultButtonClassName = useMemo(() => css({
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        padding: _getPadding(variant),
        margin: 0,
        overflow: 'hidden',
        display: 'flex',
        borderRadius: 4,
        backgroundColor: backgroundColor[variantWithDisabled],
        border: _getBorder(variant, variantWithDisabled),
        color: textColor[variantWithDisabled],
        transition: 'box-shadow .25s',
        WebkitAppRegion: 'no-drag',
        ...styles.smallText,
        ...sizeOverrides,
        '&[data-hovered]': _getHoveredStyles(variant),
        '&[data-pressed]': _getActiveStyles(variant, bounce),
    }), [bounce, variant, variantWithDisabled, sizeOverrides]);
    const className = restProps.className;
    return (<ReactAriaButton ref={ref} {...restProps} className={typeof className === 'function'
            ? renderProps => cx(defaultButtonClassName, className(renderProps))
            : cx(defaultButtonClassName, className)}>
        {children}
      </ReactAriaButton>);
});
Button.displayName = 'Button';
export const ButtonWithLoading = forwardRef((props, ref) => {
    const { isLoading, children, style, ...buttonProps } = props;
    return (<Button {...buttonProps} ref={ref} style={buttonRenderProps => ({
            position: 'relative',
            ...(typeof style === 'function' ? style(buttonRenderProps) : style),
        })}>
      {isLoading && (<View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
            }}>
          <AnimatedLoading style={{ width: 20, height: 20 }}/>
        </View>)}
      <View style={{
            opacity: isLoading ? 0 : 1,
            flexDirection: 'row',
            alignItems: 'center',
        }}>
        {children}
      </View>
    </Button>);
});
ButtonWithLoading.displayName = 'ButtonWithLoading';
