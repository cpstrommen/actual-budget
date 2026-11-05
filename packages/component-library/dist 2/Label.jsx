import { forwardRef } from 'react';
import { styles } from './styles';
import { Text } from './Text';
import { theme } from './theme';
export const Label = forwardRef(({ title, style }, ref) => {
    return (<Text ref={ref} style={{
            ...styles.text,
            color: theme.tableRowHeaderText,
            textAlign: 'right',
            fontSize: 14,
            marginBottom: 2,
            ...style,
        }}>
        {title}
      </Text>);
});
Label.displayName = 'Label';
