import { css } from '@emotion/css';
import { Button } from '#Button';
import { theme } from '#theme';
export function ModeButton({ selected, children, style, onSelect, }) {
    return (<Button variant="bare" className={css({
            padding: '5px 10px',
            backgroundColor: theme.menuBackground,
            fontSize: 'inherit',
            ...style,
            ...(selected && {
                backgroundColor: theme.buttonPrimaryBackground,
                color: theme.buttonPrimaryText,
                ':hover': {
                    backgroundColor: theme.buttonPrimaryBackgroundHover,
                    color: theme.buttonPrimaryTextHover,
                },
            }),
        })} onPress={onSelect}>
      {children}
    </Button>);
}
