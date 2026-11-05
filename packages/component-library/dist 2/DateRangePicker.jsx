import { useRef, useState } from 'react';
import { Button } from '#Button';
import { useResponsive } from '#hooks/useResponsive';
import { Popover } from '#Popover';
import { Text } from '#Text';
import { theme } from '#theme';
import { View } from '#View';
import { DayRangeCalendar } from './date-range-picker/DayRangeCalendar';
import { GranularityToggle } from './date-range-picker/GranularityToggle';
import { RangeSelector } from './date-range-picker/RangeSelector';
import { clamp, currentDay, currentMonth, firstDayOfMonth, formatDate, getMonth, lastDayOfMonth, valueIsDay, } from './date-range-picker/util';
// Far-future sentinel: sorts after any real date string.
const NO_MAX = '9999-12-31';
const sectionTitleStyle = {
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    color: theme.pageTextSubdued,
};
export function DateRangePicker({ start, end, minDate, maxDate, granularities = ['month'], presets, firstDayOfWeek = 'sun', locale, formatDayLabel, labels, onChangeDates, }) {
    const effectiveMax = maxDate ?? NO_MAX;
    const triggerRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const { isNarrowWidth } = useResponsive();
    const allowsDay = granularities.includes('day');
    const showGranularityToggle = allowsDay && granularities.includes('month');
    // Edit a local draft while open; the caller only recomputes on commit. The
    // draft's shape encodes the granularity, so it survives the remounts that
    // callers with a loading early-return cause on every commit.
    const [draftStart, setDraftStart] = useState(start);
    const [draftEnd, setDraftEnd] = useState(end);
    // The preset behind the current draft; its onSelect commits on close so the
    // caller keeps the preset's semantics (e.g. a live range) over a plain
    // static range. Cleared by any manual edit.
    const [draftPreset, setDraftPreset] = useState(null);
    const isDay = allowsDay && valueIsDay(draftStart);
    // Guards against committing twice when the trigger button and the popover's
    // close event both fire.
    const skipCommitRef = useRef(false);
    // Normalize the bounds to each granularity once: month-shaped bounds widen
    // to whole months in day mode, day-shaped bounds stay exact. A month-shaped
    // cap that reaches the current month would otherwise widen to that month's
    // last day, allowing days after today.
    const monthMin = getMonth(minDate);
    const monthMax = getMonth(effectiveMax);
    const dayMin = valueIsDay(minDate) ? minDate : firstDayOfMonth(minDate);
    const dayMax = monthMax === currentMonth()
        ? currentDay()
        : valueIsDay(effectiveMax)
            ? effectiveMax
            : lastDayOfMonth(effectiveMax);
    function openPopover() {
        if (allowsDay && valueIsDay(start)) {
            setDraftStart(start);
            setDraftEnd(end);
        }
        else {
            setDraftStart(getMonth(start));
            setDraftEnd(getMonth(end));
        }
        setDraftPreset(null);
        skipCommitRef.current = false;
        setIsOpen(true);
    }
    function changeGranularity(next) {
        if (next === (isDay ? 'day' : 'month'))
            return;
        // Only reshape the draft; committing here recomputes the caller's view,
        // which can unmount this picker and close the popover. Commit on close.
        setDraftStart(next === 'day'
            ? clamp(firstDayOfMonth(draftStart), dayMin, dayMax)
            : getMonth(draftStart));
        setDraftEnd(next === 'day'
            ? clamp(lastDayOfMonth(draftEnd), dayMin, dayMax)
            : getMonth(draftEnd));
        setDraftPreset(null);
    }
    function closeAndCommit() {
        setIsOpen(false);
        if (skipCommitRef.current) {
            return;
        }
        skipCommitRef.current = true;
        if (draftPreset) {
            draftPreset.onSelect();
        }
        else if (draftStart !== start || draftEnd !== end) {
            onChangeDates(draftStart, draftEnd);
        }
    }
    const hasSidebar = showGranularityToggle || Boolean(presets?.length);
    function setDraft(nextStart, nextEnd) {
        // Keep the range ordered regardless of which grid the user clicked.
        if (nextStart > nextEnd) {
            [nextStart, nextEnd] = [nextEnd, nextStart];
        }
        setDraftStart(nextStart);
        setDraftEnd(nextEnd);
        setDraftPreset(null);
    }
    const shownStart = isOpen ? draftStart : start;
    const shownEnd = isOpen ? draftEnd : end;
    // Format by the values' actual shape; the committed values may be
    // day-shaped even when day mode is off.
    const formatLabel = (value) => valueIsDay(value)
        ? (formatDayLabel?.(value) ??
            formatDate(value, locale, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
            }))
        : formatDate(value, locale, { month: 'short', year: 'numeric' });
    const label = `${formatLabel(shownStart)} – ${formatLabel(shownEnd)}`;
    return (<View>
      <Button ref={triggerRef} data-testid="date-range-picker-trigger" onPress={() => (isOpen ? closeAndCommit() : openPopover())}>
        {label}
      </Button>

      <Popover triggerRef={triggerRef} placement="bottom start" isOpen={isOpen} onOpenChange={nextOpen => {
            if (!nextOpen) {
                closeAndCommit();
            }
        }} style={{ padding: 0 }}>
        <View style={{ flexDirection: isNarrowWidth ? 'column' : 'row' }}>
          <View style={{
            padding: 15,
            ...(hasSidebar &&
                (isNarrowWidth
                    ? { borderBottom: `1px solid ${theme.tableBorder}` }
                    : { borderRight: `1px solid ${theme.tableBorder}` })),
        }}>
            {isDay ? (<DayRangeCalendar start={draftStart} end={draftEnd} min={dayMin} max={dayMax} firstDayOfWeek={firstDayOfWeek} locale={locale} labels={labels} onChange={setDraft}/>) : (<RangeSelector start={draftStart} end={draftEnd} min={monthMin} max={monthMax} locale={locale} labels={labels} onChange={setDraft}/>)}
          </View>

          {hasSidebar && (<View style={{ padding: 15, minWidth: 140, gap: 16 }}>
              {showGranularityToggle && (<View>
                  <Text style={sectionTitleStyle}>{labels.selectBy}</Text>
                  <GranularityToggle value={isDay ? 'day' : 'month'} monthLabel={labels.month} dayLabel={labels.day} onChange={changeGranularity}/>
                </View>)}

              {Boolean(presets?.length) && (<View>
                  <Text style={sectionTitleStyle}>{labels.quickSelect}</Text>
                  <View style={{
                    gap: 4,
                    maxHeight: 200,
                    overflowY: 'auto',
                    paddingRight: 4,
                }}>
                    {presets?.map(preset => {
                    // Derive the active preset from the shown range instead
                    // of storing it, so it survives closing and reopening
                    // without persisting anything.
                    const [presetStart, presetEnd] = preset.getRange();
                    const isActive = presetStart === draftStart && presetEnd === draftEnd;
                    return (<Button key={preset.key} variant={isActive ? 'primary' : 'bare'} aria-pressed={isActive} onPress={() => {
                            // Preview in the draft; the commit happens on
                            // close, like manual selection.
                            setDraftStart(presetStart);
                            setDraftEnd(presetEnd);
                            setDraftPreset(preset);
                        }} style={{
                            justifyContent: 'flex-start',
                            fontSize: 13,
                            // Match primary's 1px border so toggling the
                            // active preset doesn't shift the list.
                            ...(!isActive && {
                                border: '1px solid transparent',
                            }),
                        }}>
                          {preset.label}
                        </Button>);
                })}
                  </View>
                </View>)}
            </View>)}
        </View>
      </Popover>
    </View>);
}
