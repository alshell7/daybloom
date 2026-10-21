import { createParser } from '@openuidev/lang-core';
import { describe, expect, it } from 'vitest';
import { checkUi, specLibrary, uiPrompt } from './prompt';
import { SPECS } from './schema';

const SAMPLE = `root = Stack([say, plan, more])
say = Callout("A short break after lunch helps.", "tip")
plan = PlanProposal([a, b], "today", "Your afternoon")
a = PlanItem("Write the report intro", 45, "14:00", "focus", null, "fresh after lunch")
b = PlanItem("Walk outside", 20, null, "move")
more = Choices(["Make it lighter", "Add a break"])`;

describe('genui: the prompt', () => {
  it('teaches every component with its signature', () => {
    const p = uiPrompt('alef');
    for (const s of SPECS) expect(p).toContain(`${s.name}(`);
    expect(p).toContain('PlanProposal(items: PlanItem[]');
    expect(p).toContain('BlockCard(key: string');
    expect(p).toContain('```openui');
    expect(p).toContain('feeling tag');
    expect(p).not.toContain('Hoisting & Streaming');
    expect(p).toContain('## Examples');
    expect(p).toContain('PlanProposal for a plan');
    expect(p).not.toMatch(/Your ENTIRE response must be valid openui-lang/);
  });

  it('speaks to Ask Daybloom without a feeling tag', () => {
    expect(uiPrompt('assistant')).not.toContain('feeling tag');
  });

  it('stays a reasonable size', () => {
    expect(uiPrompt('alef').length).toBeLessThan(12_000);
  });
});

describe('genui: parsing answers', () => {
  it('parses a sample answer into the components', () => {
    const r = createParser(specLibrary().toJSONSchema()).parse(SAMPLE);
    expect(r.meta.errors).toEqual([]);
    expect(r.root?.typeName).toBe('Stack');
    const kids = r.root!.props.children as { typeName: string; props: Record<string, any> }[];
    expect(kids.map((k) => k.typeName)).toEqual(['Callout', 'PlanProposal', 'Choices']);
    const plan = kids[1].props;
    expect(plan.title).toBe('Your afternoon');
    expect(plan.items.map((i: any) => i.props)).toEqual([
      { title: 'Write the report intro', minutes: 45, start: '14:00', category: 'focus', id: null, why: 'fresh after lunch' },
      { title: 'Walk outside', minutes: 20, start: null, category: 'move' },
    ]);
  });

  it('keeps UI that draws, and drops what would draw nothing', () => {
    expect(checkUi(SAMPLE)).toBe(SAMPLE);
    expect(checkUi('root = BlockCard("task:x@2026-10-21")')).not.toBeNull();
    expect(checkUi('Just words, no code.')).toBeNull();
    expect(checkUi('root = Stack([Bogus("x")])')).toBeNull();
    expect(checkUi('root = Stack([])')).toBeNull();
    expect(checkUi('root = Stack([PlanItem("Alone", 10)])')).toBeNull();
    expect(checkUi('root = Stack([t,')).toBeNull();
    // A reply that ran out of room mid-plan: words alone beat half a plan.
    expect(checkUi('root = Stack([p])\np = PlanProposal([a, b])\na = PlanItem("Emails", 30)\nb = PlanItem("Walk", ')).toBeNull();
    expect(checkUi('')).toBeNull();
    expect(checkUi(null)).toBeNull();
  });

  it('drops items with the wrong types but keeps the rest', () => {
    const r = createParser(specLibrary().toJSONSchema()).parse('root = Stack([p])\np = PlanProposal([PlanItem("Ok", 30), PlanItem("Bad", "30")])');
    const items = (r.root!.props.children as any[])[0].props.items;
    expect(items.map((i: any) => i.props.title)).toEqual(['Ok']);
  });
});
