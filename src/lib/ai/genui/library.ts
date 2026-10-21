// Daybloom's generative-UI library: each spec from schema.ts paired with the Svelte component
// that draws it (components/genui/), as an OpenUI library for <Renderer>. Only GenUi.svelte
// imports this, and only once an answer carries UI, so none of it loads before then. The
// prompt is made from the same specs without components (prompt.ts).

import { createLibrary, defineComponent, type ComponentRenderer } from '@openuidev/svelte-lang';
import BacklogItems from '../../../components/genui/BacklogItems.svelte';
import BarChart from '../../../components/genui/BarChart.svelte';
import BlockCard from '../../../components/genui/BlockCard.svelte';
import Callout from '../../../components/genui/Callout.svelte';
import Card from '../../../components/genui/Card.svelte';
import Choices from '../../../components/genui/Choices.svelte';
import ConfirmAction from '../../../components/genui/ConfirmAction.svelte';
import DayStrip from '../../../components/genui/DayStrip.svelte';
import Empty from '../../../components/genui/Empty.svelte';
import FreeSlots from '../../../components/genui/FreeSlots.svelte';
import PlanProposal from '../../../components/genui/PlanProposal.svelte';
import ProgressRing from '../../../components/genui/ProgressRing.svelte';
import Row from '../../../components/genui/Row.svelte';
import Stack from '../../../components/genui/Stack.svelte';
import Stat from '../../../components/genui/Stat.svelte';
import StatTiles from '../../../components/genui/StatTiles.svelte';
import Steps from '../../../components/genui/Steps.svelte';
import Text from '../../../components/genui/Text.svelte';
import { GROUPS, SPECS } from './schema';

const DRAW: Record<string, ComponentRenderer<any>> = {
  Stack,
  Row,
  Card,
  Text,
  Callout,
  BlockCard,
  DayStrip,
  FreeSlots,
  PlanItem: Empty,
  PlanProposal,
  Steps,
  Choices,
  Stat,
  StatTiles,
  BarChart,
  ProgressRing,
  ConfirmAction,
  BacklogItems,
};

export const library = createLibrary({
  components: SPECS.map((s) => defineComponent({ ...s, component: DRAW[s.name] ?? Empty })),
  componentGroups: GROUPS,
  root: 'Stack',
});
