import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Text } from './Text';
import { theme } from './theme';
import { Toggle } from './Toggle';
import { View } from './View';
const MenuLine = Symbol('menu-line');
const MenuLabel = Symbol('menu-label');
Menu.line = MenuLine;
Menu.label = MenuLabel;
function Keybinding({ keyName }) {
    return (<Text style={{ fontSize: 10, color: theme.menuKeybindingText }}>
      {keyName}
    </Text>);
}
function isLabel(item) {
    return item.type === Menu.label;
}
export function Menu({ header, footer, items: allItems, onMenuSelect, style, className, getItemStyle, slot, }) {
    const elRef = useRef(null);
    const items = allItems.filter(x => x);
    const filteredItems = items.filter(item => item && item !== Menu.line && item.type !== Menu.label);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const currentIndex = filteredItems.indexOf(items[hoveredIndex || 0]);
    const transformIndex = (idx) => items.indexOf(filteredItems[idx]);
    // Keyboard navigation starts on the first selectable item, so a leading
    // heading or line is never hovered
    function hoverPrevious() {
        if (filteredItems.length === 0) {
            return;
        }
        setHoveredIndex(hoveredIndex === null
            ? transformIndex(0)
            : transformIndex(Math.max(currentIndex - 1, 0)));
    }
    function hoverNext() {
        if (filteredItems.length === 0) {
            return;
        }
        setHoveredIndex(hoveredIndex === null
            ? transformIndex(0)
            : transformIndex(Math.min(currentIndex + 1, filteredItems.length - 1)));
    }
    function selectItem() {
        const item = items[hoveredIndex || 0];
        if (hoveredIndex !== null &&
            item !== Menu.line &&
            !isLabel(item) &&
            !item.disabled) {
            onMenuSelect?.(item.name);
        }
    }
    function onKeyDown(e) {
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                hoverPrevious();
                break;
            case 'ArrowDown':
                e.preventDefault();
                hoverNext();
                break;
            case 'Enter':
                e.preventDefault();
                selectItem();
                break;
            default:
        }
    }
    useEffect(() => {
        const activeElement = document.activeElement;
        if (activeElement &&
            (['input', 'select', 'textarea'].includes(activeElement.tagName.toLowerCase()) ||
                activeElement.hasAttribute('contenteditable') ||
                activeElement.getAttribute('role') === 'textbox')) {
            return;
        }
        const el = elRef.current;
        el?.focus();
    }, []);
    return (<View role="menu" className={className} style={{ outline: 'none', borderRadius: 4, overflow: 'hidden', ...style }} tabIndex={0} onKeyDown={onKeyDown} innerRef={elRef}>
      {header}
      {items.map((item, idx) => {
            if (item === Menu.line) {
                return (<View key={idx} style={{ margin: '3px 0px' }}>
              <View style={{ borderTop: '1px solid ' + theme.menuBorder }}/>
            </View>);
            }
            else if (isLabel(item)) {
                return (<Text key={idx} style={{
                        color: theme.menuItemTextHeader,
                        fontSize: 11,
                        lineHeight: '1em',
                        textTransform: 'uppercase',
                        margin: '3px 9px',
                        marginTop: 5,
                    }}>
              {item.name}
            </Text>);
            }
            const Icon = item.icon;
            return (<Button excludeFromTabOrder key={String(item.name)} variant="bare" slot={slot} style={{
                    cursor: 'default',
                    padding: 10,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: theme.menuItemText,
                    ...(item.disabled && { color: theme.buttonBareDisabledText }),
                    ...(!item.disabled &&
                        hoveredIndex === idx && {
                        backgroundColor: theme.menuItemBackgroundHover,
                        color: theme.menuItemTextHover,
                    }),
                    ...(!isLabel(item) && getItemStyle?.(item)),
                }} onHoverStart={() => setHoveredIndex(idx)} onHoverEnd={() => setHoveredIndex(null)} onPress={() => {
                    if (!item.disabled &&
                        item.toggle === undefined &&
                        !isLabel(item)) {
                        onMenuSelect?.(item.name);
                    }
                }}>
            {/* Force it to line up evenly */}
            {item.toggle === undefined ? (<>
                {Icon && (<Icon width={item.iconSize || 10} height={item.iconSize || 10} style={{ marginRight: 7, width: item.iconSize || 10 }}/>)}
                <Text title={item.tooltip}>{item.text}</Text>
                <View style={{ flex: 1 }}/>
              </>) : (<View style={{
                        flexDirection: 'row',
                        flex: 1,
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                <label htmlFor={String(item.name)} title={item.tooltip}>
                  {item.text}
                </label>
                <Toggle id={String(item.name)} isOn={item.toggle} style={{ marginLeft: 5 }} onToggle={() => !item.disabled &&
                        !isLabel(item) &&
                        item.toggle !== undefined &&
                        onMenuSelect?.(item.name)}/>
              </View>)}
            {item.key && <Keybinding keyName={item.key}/>}
          </Button>);
        })}
      {footer}
    </View>);
}
