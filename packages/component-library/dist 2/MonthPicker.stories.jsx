import { useState } from 'react';
import { fn } from 'storybook/test';
import { MonthPicker } from './MonthPicker';
const meta = {
    title: 'Components/MonthPicker',
    component: MonthPicker,
    parameters: {
        layout: 'centered',
    },
    args: {
        value: '2024-06',
        locale: 'en-US',
        labels: { previous: 'Previous', next: 'Next' },
        onChange: fn(),
    },
    tags: ['autodocs'],
};
export default meta;
export const Default = {
    render: args => {
        const [value, setValue] = useState(args.value);
        return <MonthPicker {...args} value={value} onChange={setValue}/>;
    },
};
export const WithBounds = {
    args: {
        minDate: '2023-04',
        maxDate: '2025-09',
    },
};
export const Empty = {
    args: {
        value: '',
        placeholder: 'Select month',
    },
};
