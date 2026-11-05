import { Text } from './Text';
export function TextOneLine({ children, ...props }) {
    return (<Text {...props} style={{
            ...props.style,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'block',
        }}>
      {children}
    </Text>);
}
