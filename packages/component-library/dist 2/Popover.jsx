import { useCallback, useEffect, useRef } from 'react';
import { Popover as ReactAriaPopover } from 'react-aria-components';
import { css } from '@emotion/css';
import { styles } from './styles';
export const Popover = ({ style = {}, shouldCloseOnInteractOutside, ...props }) => {
    const ref = useRef(null);
    const handleFocus = useCallback((e) => {
        if (!ref.current?.contains(e.relatedTarget)) {
            props.onOpenChange?.(false);
        }
    }, [props]);
    useEffect(() => {
        if (!props.isNonModal)
            return;
        if (props.isOpen) {
            ref.current?.addEventListener('focusout', handleFocus);
        }
        else {
            ref.current?.removeEventListener('focusout', handleFocus);
        }
    }, [handleFocus, props.isNonModal, props.isOpen]);
    return (<ReactAriaPopover data-popover ref={ref} placement="bottom end" offset={1} className={css({
            ...styles.tooltip,
            ...styles.lightScrollbar,
            padding: 0,
            userSelect: 'none',
            ...style,
        })} shouldCloseOnInteractOutside={element => {
            if (shouldCloseOnInteractOutside) {
                return shouldCloseOnInteractOutside(element);
            }
            return true;
        }} {...props}/>);
};
