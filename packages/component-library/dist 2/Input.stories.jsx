import { useState } from 'react';
import { Input } from './Input';
import { View } from './View';
const meta = {
    title: 'Components/Input',
    component: Input,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};
export default meta;
export const Default = {
    args: {
        placeholder: 'Enter text...',
    },
    decorators: [
        Story => (<View style={{ width: 250 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'A basic input field with placeholder text.',
            },
        },
    },
};
export const WithValue = {
    args: {
        defaultValue: 'Hello World',
    },
    decorators: [
        Story => (<View style={{ width: 250 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Input with a pre-filled value.',
            },
        },
    },
};
export const Disabled = {
    args: {
        defaultValue: 'Disabled input',
        disabled: true,
    },
    decorators: [
        Story => (<View style={{ width: 250 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Disabled inputs prevent user interaction and display muted text.',
            },
        },
    },
};
export const WithOnEnter = {
    render: function Render() {
        const [submittedValue, setSubmittedValue] = useState('');
        return (<View style={{
                width: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
        <Input placeholder="Press Enter to submit" onEnter={value => setSubmittedValue(value)}/>
        {submittedValue && <span>Submitted: {submittedValue}</span>}
      </View>);
    },
    parameters: {
        docs: {
            description: {
                story: 'The onEnter callback is triggered when the user presses Enter.',
            },
        },
    },
};
export const WithOnEscape = {
    render: function Render() {
        const [escaped, setEscaped] = useState(false);
        return (<View style={{
                width: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
        <Input placeholder="Press Escape to cancel" onEscape={() => setEscaped(true)}/>
        {escaped && <span>Escape pressed!</span>}
      </View>);
    },
    parameters: {
        docs: {
            description: {
                story: 'The onEscape callback is triggered when the user presses Escape.',
            },
        },
    },
};
export const WithOnChangeValue = {
    render: function Render() {
        const [value, setValue] = useState('');
        return (<View style={{
                width: 250,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
            }}>
        <Input placeholder="Type something..." onChangeValue={newValue => setValue(newValue)}/>
        <span>Current value: {value}</span>
      </View>);
    },
    parameters: {
        docs: {
            description: {
                story: 'The onChangeValue callback provides the new value on each keystroke.',
            },
        },
    },
};
export const NumberInput = {
    args: {
        type: 'number',
        placeholder: '0',
    },
    decorators: [
        Story => (<View style={{ width: 150 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Input configured for numeric values.',
            },
        },
    },
};
export const PasswordInput = {
    args: {
        type: 'password',
        placeholder: 'Enter password',
    },
    decorators: [
        Story => (<View style={{ width: 250 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'Password input masks the entered text.',
            },
        },
    },
};
export const Sizes = {
    render: () => (<View style={{ gap: 10 }}>
      <Input size="small" placeholder="Small"/>
      <Input size="medium" placeholder="Medium"/>
      <Input size="large" placeholder="Large"/>
      <Input size="extra-large" placeholder="Extra Large"/>
    </View>),
    decorators: [
        Story => (<View style={{ width: 250 }}>
        <Story />
      </View>),
    ],
    parameters: {
        docs: {
            description: {
                story: 'The standard size vocabulary. Values adapt to the viewport: resize the story canvas below 512px, 730px and 1100px to see the responsive steps.',
            },
        },
    },
};
