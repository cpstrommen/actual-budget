import { styles } from '@actual-app/components/styles';
import { Card } from './Card';
import { Paragraph } from './Paragraph';
import { theme } from './theme';
const meta = {
    title: 'Components/Card',
    component: Card,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};
export default meta;
export const Default = {
    args: {
        children: 'Card content goes here',
        style: {
            padding: 20,
            width: 300,
            color: theme.pageText,
        },
    },
    parameters: {
        docs: {
            description: {
                story: `
Default Card component uses the following theme CSS variables:
  - \`--color-cardBackground\`
  - \`--color-cardBorder\`
`,
            },
        },
    },
};
export const WithCustomContent = {
    args: {
        style: {
            padding: 20,
            width: 300,
            color: theme.pageText,
        },
    },
    render: args => (<Card {...args}>
      <h3 style={{ ...styles.largeText }}>Card Title</h3>
      <Paragraph style={{ margin: 0 }}>
        This is a card with more complex content including a title and
        paragraph.
      </Paragraph>
    </Card>),
};
export const Narrow = {
    args: {
        children: 'Narrow card',
        style: {
            padding: 15,
            width: 150,
            color: theme.pageText,
        },
    },
};
export const Wide = {
    args: {
        children: 'Wide card with more content space',
        style: {
            padding: 25,
            width: 500,
            color: theme.pageText,
        },
    },
};
