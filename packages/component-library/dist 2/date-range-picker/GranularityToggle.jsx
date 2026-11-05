import { ModeButton } from '#ModeButton';
import { theme } from '#theme';
import { View } from '#View';
const segmentStyle = { borderRadius: 0, fontSize: 12, padding: '4px 12px' };
export function GranularityToggle({ value, monthLabel, dayLabel, onChange, }) {
    return (<View style={{
            flexDirection: 'row',
            border: `1px solid ${theme.buttonNormalBorder}`,
            borderRadius: 4,
            overflow: 'hidden',
            alignSelf: 'flex-start',
        }}>
      <ModeButton selected={value === 'month'} onSelect={() => onChange('month')} style={segmentStyle}>
        {monthLabel}
      </ModeButton>
      <ModeButton selected={value === 'day'} onSelect={() => onChange('day')} style={segmentStyle}>
        {dayLabel}
      </ModeButton>
    </View>);
}
