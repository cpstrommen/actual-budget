import React from 'react';
import { View } from './View';
export const SpaceBetween = ({ direction = 'horizontal', gap = 15, wrap = true, align = 'center', style, children, ...props }) => {
    return (<View style={{
            flexWrap: wrap ? 'wrap' : 'nowrap',
            flexDirection: direction === 'horizontal' ? 'row' : 'column',
            alignItems: align,
            gap,
            ...style,
        }} {...props}>
      {children}
    </View>);
};
