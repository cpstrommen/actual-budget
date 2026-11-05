import { forwardRef } from 'react';
import { theme } from './theme';
import { View } from './View';
export const Card = forwardRef(({ children, ...props }, ref) => {
    return (<View {...props} ref={ref} style={{
            marginTop: 15,
            marginLeft: 5,
            marginRight: 5,
            borderRadius: 6,
            backgroundColor: theme.cardBackground,
            borderColor: theme.cardBorder,
            boxShadow: '0 1px 2px #9594A8',
            ...props.style,
        }}>
        <View style={{
            borderRadius: 6,
            overflow: 'hidden',
        }}>
          {children}
        </View>
      </View>);
});
Card.displayName = 'Card';
