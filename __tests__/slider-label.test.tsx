import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Slider } from '../src/components/edit/Slider';
import { caps } from '../src/theme/type';

const thumbLeft = () => {
  const kids = screen.getByLabelText('Gap').children as any[];
  return kids[kids.length - 1].props.style.left;
};

test('released slider keeps its thumb on the sent value until the value catches up (no snap back)', async () => {
  const sent: number[] = [];
  const ui = (value: number) => <Slider label="Gap" value={value} onChange={(v) => sent.push(v)} />;
  await render(ui(0));
  const s = screen.getByLabelText('Gap');
  await fireEvent(s, 'layout', { nativeEvent: { layout: { width: 200 } } });
  await fireEvent(s, 'responderGrant', { nativeEvent: { pageX: 120, locationX: 100 } });
  await fireEvent(s, 'responderRelease');
  expect(sent).toEqual([50]);
  expect(thumbLeft()).toBe(100 - 9); // still at 50, though value is still 0
  await screen.rerender(ui(50));
  expect(thumbLeft()).toBe(100 - 9);
  await screen.rerender(ui(20)); // changed from outside: follows value
  expect(thumbLeft()).toBe(40 - 9);
});

test('labels uppercase in English on a Turkish Android phone: GRAIN, not GRAİN', () => {
  expect(caps('Grain · Saturation', 'tr-TR')).toBe('GRAIN · SATURATION');
  expect(caps('Grain', 'en-US')).toBe('Grain'); // textTransform does it
  const os = Platform.OS;
  Platform.OS = 'ios';
  try {
    expect(caps('Grain', 'tr-TR')).toBe('Grain'); // iOS uppercases without the locale
  } finally {
    Platform.OS = os;
  }
});
