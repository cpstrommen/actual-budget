import { Button } from './Button';
import { SpaceBetween } from './SpaceBetween';
import { View } from './View';
const meta = {
    title: 'Components/SpaceBetween',
    component: SpaceBetween,
    parameters: {
        layout: 'centered',
    },
    args: {
        style: {
            display: 'flex',
        },
    },
    tags: ['autodocs'],
};
export default meta;
const Box = ({ children }) => (<View style={{
        padding: '10px 20px',
        backgroundColor: '#e0e0e0',
        borderRadius: 4,
        display: 'flex',
    }}>
    {children}
  </View>);
export const Horizontal = {
    args: {
        direction: 'horizontal',
        children: (<>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>),
    },
    parameters: {
        docs: {
            description: {
                story: 'SpaceBetween lays out children horizontally with even spacing by default.',
            },
        },
    },
};
export const Vertical = {
    args: {
        direction: 'vertical',
        children: (<>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </>),
    },
    parameters: {
        docs: {
            description: {
                story: 'Items laid out vertically with default spacing.',
            },
        },
    },
};
export const CustomGap = {
    args: {
        direction: 'horizontal',
        gap: 30,
        children: (<>
        <Box>Gap 30</Box>
        <Box>Gap 30</Box>
        <Box>Gap 30</Box>
      </>),
    },
    parameters: {
        docs: {
            description: {
                story: 'Custom gap between items.',
            },
        },
    },
};
export const NoWrap = {
    args: {
        direction: 'horizontal',
        wrap: false,
        children: (<>
        <Box>No Wrap</Box>
        <Box>No Wrap</Box>
        <Box>No Wrap</Box>
        <Box>No Wrap</Box>
      </>),
    },
    parameters: {
        docs: {
            description: {
                story: 'Items will not wrap to the next line when wrap is false.',
            },
        },
    },
};
export const WithButtons = {
    args: {
        direction: 'horizontal',
        gap: 10,
        children: (<>
        <Button variant="bare">Cancel</Button>
        <Button variant="primary">Save</Button>
      </>),
    },
    parameters: {
        docs: {
            description: {
                story: 'A common use case: spacing action buttons.',
            },
        },
    },
};
