import { View } from './View';
export function FormError({ style, children }) {
    return (<View style={{ color: 'red', fontSize: 13, ...style }}>{children}</View>);
}
