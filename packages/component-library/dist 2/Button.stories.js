import { fn } from 'storybook/test';
import { Button } from './Button';
const meta = {
    title: 'Components/Button',
    component: Button,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        onClick: { action: 'clicked' },
    },
    args: { onClick: fn() },
};
export default meta;
export const Primary = {
    args: {
        variant: 'primary',
        bounce: false,
        children: 'Button Text',
    },
    parameters: {
        docs: {
            description: {
                story: `
Primary button variant uses the following theme CSS variables:
  - \`--color-buttonPrimaryText\`
  - \`--color-buttonPrimaryTextHover\`
  - \`--color-buttonPrimaryBackground\`
  - \`--color-buttonPrimaryBackgroundHover\`
  - \`--color-buttonPrimaryBorder\`
  - \`--color-buttonPrimaryShadow\`
  - \`--color-buttonPrimaryDisabledText\`
  - \`--color-buttonPrimaryDisabledBackground\`
  - \`--color-buttonPrimaryDisabledBorder\`
`,
            },
        },
    },
};
export const Normal = {
    args: {
        variant: 'normal',
        bounce: false,
        children: 'Button Text',
    },
    parameters: {
        docs: {
            description: {
                story: `
Normal button variant uses the following theme CSS variables:
  - \`--color-buttonNormalText\`
  - \`--color-buttonNormalTextHover\`
  - \`--color-buttonNormalBackground\`
  - \`--color-buttonNormalBackgroundHover\`
  - \`--color-buttonNormalBorder\`
  - \`--color-buttonNormalShadow\`
  - \`--color-buttonNormalSelectedText\`
  - \`--color-buttonNormalSelectedBackground\`
  - \`--color-buttonNormalDisabledText\`
  - \`--color-buttonNormalDisabledBackground\`
  - \`--color-buttonNormalDisabledBorder\`
`,
            },
        },
    },
};
export const Bare = {
    args: {
        variant: 'bare',
        bounce: false,
        children: 'Button Text',
    },
    parameters: {
        docs: {
            description: {
                story: `
Bare button variant uses the following theme CSS variables:
  - \`--color-buttonBareText\`
  - \`--color-buttonBareTextHover\`
  - \`--color-buttonBareBackground\`
  - \`--color-buttonBareBackgroundHover\`
  - \`--color-buttonBareBackgroundActive\`
  - \`--color-buttonBareDisabledText\`
  - \`--color-buttonBareDisabledBackground\`
`,
            },
        },
    },
};
