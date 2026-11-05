import { Text } from './Text';
import { View } from './View';
const meta = {
    title: 'Components/Text',
    component: Text,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
};
export default meta;
export const Default = {
    args: {
        children: 'This is a text element',
    },
    parameters: {
        docs: {
            description: {
                story: 'A basic Text component renders as a span element.',
            },
        },
    },
};
export const WithStyle = {
    args: {
        children: 'Styled text',
        style: {
            fontSize: 18,
            fontWeight: 'bold',
            color: '#1a73e8',
        },
    },
    parameters: {
        docs: {
            description: {
                story: 'Text can accept custom styles via the style prop.',
            },
        },
    },
};
export const FontSizes = {
    render: () => (<View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12 }}>Small (12px)</Text>
      <Text style={{ fontSize: 14 }}>Default (14px)</Text>
      <Text style={{ fontSize: 18 }}>Medium (18px)</Text>
      <Text style={{ fontSize: 24 }}>Large (24px)</Text>
      <Text style={{ fontSize: 32 }}>Extra Large (32px)</Text>
    </View>),
    parameters: {
        docs: {
            description: {
                story: 'Text at various font sizes.',
            },
        },
    },
};
export const FontWeights = {
    render: () => (<View style={{ gap: 8 }}>
      <Text style={{ fontWeight: 300 }}>Light (300)</Text>
      <Text style={{ fontWeight: 400 }}>Normal (400)</Text>
      <Text style={{ fontWeight: 500 }}>Medium (500)</Text>
      <Text style={{ fontWeight: 600 }}>Semi Bold (600)</Text>
      <Text style={{ fontWeight: 700 }}>Bold (700)</Text>
    </View>),
    parameters: {
        docs: {
            description: {
                story: 'Text at various font weights.',
            },
        },
    },
};
export const InlineUsage = {
    render: () => (<View>
      <span>
        This is regular text with{' '}
        <Text style={{ fontWeight: 'bold', color: '#d32f2f' }}>
          highlighted
        </Text>{' '}
        and{' '}
        <Text style={{ fontStyle: 'italic', color: '#1a73e8' }}>
          emphasized
        </Text>{' '}
        portions.
      </span>
    </View>),
    parameters: {
        docs: {
            description: {
                story: 'Text renders as a span, making it suitable for inline styling within other text.',
            },
        },
    },
};
export const Sizes = {
    render: () => (<View style={{ gap: 8 }}>
      <Text size="small">Small (12px)</Text>
      <Text size="medium">Medium (13px)</Text>
      <Text size="large">Large (15px, 16px on mobile)</Text>
      <Text size="extra-large">
        Extra Large (17px on mobile/tablet, 16px on desktop)
      </Text>
    </View>),
    parameters: {
        docs: {
            description: {
                story: 'The standard size vocabulary. Values adapt to the viewport: resize the story canvas below 512px, 730px and 1100px to see the responsive steps.',
            },
        },
    },
};
