import { css } from '@emotion/css';
export function InlineField({ label, labelWidth, children, width, style, }) {
    return (<label className={css([
            {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                margin: '7px 0',
                width,
            },
            style,
        ])}>
      <div style={{
            width: labelWidth || 75,
            textAlign: 'right',
            paddingRight: 10,
        }}>
        {label}:
      </div>
      {children}
    </label>);
}
