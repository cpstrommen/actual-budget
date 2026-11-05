import { useState } from 'react';
import { fn } from 'storybook/test';
import { DateRangePicker } from './DateRangePicker';
const labels = {
    selectBy: 'Select by',
    quickSelect: 'Quick select',
    month: 'Month',
    day: 'Day',
    previous: 'Previous',
    next: 'Next',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    year: 'Year',
    dateRange: 'Date range',
};
const meta = {
    title: 'Components/DateRangePicker',
    component: DateRangePicker,
    parameters: {
        layout: 'centered',
    },
    args: {
        start: '2024-02',
        end: '2024-06',
        minDate: '2022-01',
        maxDate: '2025-12',
        locale: 'en-US',
        labels,
        onChangeDates: fn(),
    },
    tags: ['autodocs'],
};
export default meta;
export const MonthsOnly = {};
export const WithDayGranularity = {
    args: {
        granularities: ['month', 'day'],
    },
};
export const WithPresets = {
    render: args => {
        const [range, setRange] = useState({ start: args.start, end: args.end });
        return (<DateRangePicker {...args} start={range.start} end={range.end} granularities={['month', 'day']} presets={[
                {
                    key: '3-months',
                    label: '3 months',
                    getRange: () => ['2024-04', '2024-06'],
                    onSelect: () => setRange({ start: '2024-04', end: '2024-06' }),
                },
                {
                    key: '1-year',
                    label: '1 year',
                    getRange: () => ['2023-07', '2024-06'],
                    onSelect: () => setRange({ start: '2023-07', end: '2024-06' }),
                },
            ]} onChangeDates={(start, end) => setRange({ start, end })}/>);
    },
};
