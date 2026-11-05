import { Children, cloneElement, isValidElement, useEffect, useRef, } from 'react';
/**
 * InitialFocus sets focus on its child element
 * when it mounts.
 * @param {ReactElement | function} children - A single React element or a function that returns a React element.
 * The child element should have a `ref` prop for this to work. For child components which receives a ref via another prop
 * e.g. `inputRef`, use a function as child and pass the ref to the appropriate prop.
 */
export function InitialFocus({ children, }) {
    const ref = useRef(null);
    useEffect(() => {
        if (ref.current) {
            // This is needed to avoid a strange interaction with
            // `ScopeTab`, which doesn't allow it to be focused at first for
            // some reason. Need to look into it.
            setTimeout(() => {
                if (ref.current) {
                    ref.current.focus();
                    if (ref.current instanceof HTMLInputElement ||
                        ref.current instanceof HTMLTextAreaElement) {
                        ref.current.setSelectionRange(0, 10000);
                    }
                }
            }, 0);
        }
    }, []);
    if (typeof children === 'function') {
        return children(ref);
    }
    const child = Children.only(children);
    if (isValidElement(child)) {
        return cloneElement(child, { ref });
    }
    throw new Error('InitialFocus expects a single valid React element as its child.');
}
