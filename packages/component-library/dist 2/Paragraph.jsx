import { css } from '@emotion/css';
export function Paragraph({ style, isLast, children, ...props }) {
    return (<div {...props} className={css([
            !isLast && { marginBottom: 15 },
            style,
            {
                lineHeight: '1.5em',
            },
        ])}>
      {children}
    </div>);
}
