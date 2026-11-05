import { useState } from 'react';
import { fn } from 'storybook/test';
import { ModeButton } from './ModeButton';
import { View } from './View';
const meta = {
    title: 'Components/ModeButton',
    component: ModeButton,
    parameters: {
        layout: 'centered',
    },
    args: {
        children: 'Monthly',
        onSelect: fn(),
    },
    tags: ['autodocs'],
};
export default meta;
export const Unselected = {
    args: {
        selected: false,
    },
};
export const Selected = {
    args: {
        selected: true,
    },
};
export const ModeGroup = {
    args: {
        selected: false,
    },
    render: function Render() {
        const [mode, setMode] = useState('Monthly');
        return (<View style={{ flexDirection: 'row', gap: 4 }}>
        {['Monthly', 'Yearly', 'All time'].map(label => (<ModeButton key={label} selected={mode === label} onSelect={() => setMode(label)}>
            {label}
          </ModeButton>))}
      </View>);
    },
    parameters: {
        docs: {
            description: {
                story: 'A group of mode buttons acting as an exclusive choice.',
            },
        },
    },
};
