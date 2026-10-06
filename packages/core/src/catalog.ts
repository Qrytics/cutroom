// A compact, machine-generated description of everything Claude can place on the timeline.
import { SFX } from './audio/synth.ts';
import { COMPONENTS } from './components/index.ts';
import { ANIM_IN, ANIM_OUT } from './components/draw.ts';
import { EASES } from './engine/ease.ts';
import { LOOKS } from './looks.ts';
import { AUDIO_PROPS, EFFECT_PROPS, MEDIA_PROPS, TRANSFORM_PROPS, TRANSITION_PROPS, type PropDef } from './schema/props.ts';

const fmt = (d: PropDef) => {
  const range = d.options ? ` one of [${d.options.join('|')}]` : d.min !== undefined ? ` ${d.min}..${d.max}` : '';
  return `${d.key}: ${d.type}${range} = ${JSON.stringify(d.default)}${d.animatable ? ' (animatable)' : ''}`;
};

export function catalog() {
  return {
    components: Object.values(COMPONENTS).map((c) => ({
      key: c.key, label: c.label, category: c.category, description: c.description, defaultDuration: c.defaultDuration, props: c.props.map(fmt),
    })),
    sfx: Object.values(SFX).map((s) => ({
      key: s.key, label: s.label, category: s.category, description: s.description, defaultDuration: s.defaultDuration,
      lengthMode: s.stretch ? 'fills the clip duration' : 'one-shot (fixed length)', props: s.props.map(fmt),
    })),
    sharedProps: {
      transform: TRANSFORM_PROPS.map(fmt).concat(['x/y default to the canvas center; anchor is relative to the full canvas box']),
      effects: EFFECT_PROPS.map(fmt),
      transitions: TRANSITION_PROPS.map(fmt),
      media: MEDIA_PROPS.map(fmt),
      audio: AUDIO_PROPS.map(fmt),
    },
    textAnimations: { in: ANIM_IN, out: ANIM_OUT },
    eases: EASES,
    looks: LOOKS.map((l) => ({ key: l.key, name: l.name, vibe: l.vibe, note: l.note })),
  };
}
