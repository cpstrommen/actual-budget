import { useRef, useState } from 'react';
import { Button } from './Button';
import { Menu } from './Menu';
import { Popover } from './Popover';
import { View } from './View';
const meta = {
    title: 'Components/Popover',
    component: Popover,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};
export default meta;
export const Default = {
    render: () => {
        const triggerRef = useRef(null);
        const [isOpen, setIsOpen] = useState(false);
        return (<>
        <Button ref={triggerRef} onPress={() => setIsOpen(!isOpen)}>
          Toggle Popover
        </Button>
        <Popover triggerRef={triggerRef} isOpen={isOpen} onOpenChange={setIsOpen}>
          <View style={{ padding: 10 }}>Popover content</View>
        </Popover>
      </>);
    },
    parameters: {
        docs: {
            description: {
                story: 'A basic popover triggered by a button click.',
            },
        },
    },
};
export const WithMenu = {
    render: () => {
        const triggerRef = useRef(null);
        const [isOpen, setIsOpen] = useState(false);
        return (<>
        <Button ref={triggerRef} onPress={() => setIsOpen(!isOpen)}>
          Open Menu
        </Button>
        <Popover triggerRef={triggerRef} isOpen={isOpen} onOpenChange={setIsOpen}>
          <Menu onMenuSelect={() => setIsOpen(false)} items={[
                { name: 'edit', text: 'Edit' },
                { name: 'duplicate', text: 'Duplicate' },
                Menu.line,
                { name: 'delete', text: 'Delete' },
            ]}/>
        </Popover>
      </>);
    },
    parameters: {
        docs: {
            description: {
                story: 'Popover containing a menu, a common pattern for dropdown menus.',
            },
        },
    },
};
export const CustomPlacement = {
    render: () => {
        const triggerRef = useRef(null);
        const [isOpen, setIsOpen] = useState(false);
        return (<>
        <Button ref={triggerRef} onPress={() => setIsOpen(!isOpen)}>
          Bottom Start
        </Button>
        <Popover triggerRef={triggerRef} placement="bottom start" isOpen={isOpen} onOpenChange={setIsOpen}>
          <View style={{ padding: 10 }}>
            This popover is placed at bottom start.
          </View>
        </Popover>
      </>);
    },
    parameters: {
        docs: {
            description: {
                story: 'Popover with custom placement.',
            },
        },
    },
};
export const CustomStyle = {
    render: () => {
        const triggerRef = useRef(null);
        const [isOpen, setIsOpen] = useState(false);
        return (<>
        <Button ref={triggerRef} onPress={() => setIsOpen(!isOpen)}>
          Styled Popover
        </Button>
        <Popover triggerRef={triggerRef} isOpen={isOpen} onOpenChange={setIsOpen} style={{ padding: 15, maxWidth: 250 }}>
          <View>
            This popover has custom padding and a constrained max width for
            longer content.
          </View>
        </Popover>
      </>);
    },
    parameters: {
        docs: {
            description: {
                story: 'Popover with custom styles applied.',
            },
        },
    },
};
