import { css, cx } from '@emotion/css';
export function Block(props) {
    const { className = '', style, innerRef, ...restProps } = props;
    return (<div {...restProps} ref={innerRef} className={cx(className, css(style))}/>);
}
