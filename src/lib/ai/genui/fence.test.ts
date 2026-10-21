import { describe, expect, it } from 'vitest';
import { splitUi } from './fence';

describe('genui: splitting words from UI', () => {
  it('keeps the words and takes the openui block', () => {
    const r = splitUi('[happy] Here is a gentle plan.\n\n```openui\nroot = Stack([t])\nt = Text("Hi")\n```');
    expect(r.text).toBe('[happy] Here is a gentle plan.');
    expect(r.ui).toBe('root = Stack([t])\nt = Text("Hi")');
  });

  it('accepts openui-lang fences and words after the block', () => {
    const r = splitUi('Sure.\n```openui-lang\nroot = Stack([c])\nc = Choices(["Yes", "No"])\n```\nTap one.');
    expect(r.ui).toBe('root = Stack([c])\nc = Choices(["Yes", "No"])');
    expect(r.text).toBe('Sure.\n\nTap one.');
  });

  it('forgives a missing closing fence', () => {
    const r = splitUi('Okay!\n```openui\nroot = Stack([s])\ns = FreeSlots("Walk", 20)');
    expect(r.text).toBe('Okay!');
    expect(r.ui).toBe('root = Stack([s])\ns = FreeSlots("Walk", 20)');
  });

  it('takes a plain fence only when it holds OpenUI Lang', () => {
    expect(splitUi('Look:\n```\nroot = Stack([t])\nt = Text("x")\n```').ui).toBe('root = Stack([t])\nt = Text("x")');
    const code = splitUi('Run this:\n```js\nconsole.log(1)\n```');
    expect(code.ui).toBeNull();
    expect(code.text).toContain('console.log(1)');
  });

  it('takes bare statements at the end', () => {
    const r = splitUi('[curious] Two choices.\nroot = Stack([c])\nc = Choices(["A", "B"])');
    expect(r.text).toBe('[curious] Two choices.');
    expect(r.ui).toBe('root = Stack([c])\nc = Choices(["A", "B"])');
  });

  it('leaves plain answers alone', () => {
    expect(splitUi('  Done. Moved it to 3pm.  ')).toEqual({ text: 'Done. Moved it to 3pm.', ui: null });
    expect(splitUi('The root = cause is sleep.').ui).toBeNull();
  });

  it('keeps only the first block when there are two', () => {
    const r = splitUi('A\n```openui\nroot = Stack([a])\na = Text("1")\n```\nB\n```openui\nroot = Stack([b])\nb = Text("2")\n```');
    expect(r.ui).toBe('root = Stack([a])\na = Text("1")');
    expect(r.text).toBe('A\n\nB');
  });
});
