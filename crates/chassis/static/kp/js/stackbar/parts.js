// The ready state of the share bar: one segment and one legend row per part, the free or over row, the ticks, and the one tab stop.

import { PALETTE_SIZE } from './values.js';
import { shareText } from './math.js';
import { StackbarCore } from './core.js';

/** @typedef {import('./core.js').StackbarDraw} StackbarDraw */

export class StackbarParts extends StackbarCore {
    /** The part's colour: the status colour of a part that needs attention, else the palette, round and round. @param {StackbarDraw['calc']['parts'][number]} part @param {number} i */
    colourOf(part, i) {
        return part.tone ? `var(--${part.tone})` : `var(--chart-${(i % PALETTE_SIZE) + 1})`;
    }

    /** One segment of the bar. @param {StackbarDraw} c @param {StackbarDraw['calc']['parts'][number]} part @param {number} i @param {string} words */
    segment(c, part, i, words) {
        const seg = this.make('kp-stackbar__seg');
        seg.dataset.kpStackbarKey = part.key;
        seg.setAttribute('role', c.pickable ? 'button' : 'img');
        if (c.pickable) {
            seg.setAttribute('aria-pressed', String(c.pickedKeys.has(part.key)));
            seg.toggleAttribute('data-kp-stackbar-picked', c.pickedKeys.has(part.key));
        }
        seg.setAttribute('aria-label', words);
        seg.setAttribute('data-kp-hovercard', words);
        seg.setAttribute('tabindex', '-1');
        seg.style.setProperty('--kp-share', String(part.width));
        seg.style.setProperty('--kp-stackbar-colour', this.colourOf(part, i));
        if (i >= PALETTE_SIZE) seg.setAttribute('data-kp-stackbar-hatch', '');
        return seg;
    }

    /** One legend row of a part. @param {StackbarDraw} c @param {StackbarDraw['calc']['parts'][number]} part @param {number} i */
    legendRow(c, part, i) {
        const item = this.make('kp-stackbar__item', 'li');
        item.dataset.kpStackbarKey = part.key;
        item.toggleAttribute('data-kp-stackbar-picked', c.pickable && c.pickedKeys.has(part.key));
        const swatch = this.make('kp-stackbar__swatch');
        swatch.setAttribute('aria-hidden', 'true');
        swatch.style.setProperty('--kp-stackbar-colour', this.colourOf(part, i));
        if (i >= PALETTE_SIZE) swatch.setAttribute('data-kp-stackbar-hatch', '');
        const label = this.make('kp-stackbar__label');
        label.textContent = part.label;
        label.title = part.label;
        const value = this.make('kp-stackbar__value');
        value.textContent = c.format(part.value);
        item.append(swatch, label, value);
        return item;
    }

    /** The legend row of the free rest, or of what the parts run over by. @param {StackbarDraw} c @param {string} restWords */
    restRow(c, restWords) {
        const { calc, spec, strings } = c;
        const item = this.make('kp-stackbar__item', 'li');
        item.setAttribute('data-kp-stackbar-rest', '');
        if (calc.over > 0) item.setAttribute('data-kp-stackbar-over', '');
        const swatch = this.make('kp-stackbar__swatch');
        swatch.setAttribute('aria-hidden', 'true');
        const label = this.make('kp-stackbar__label');
        label.textContent = calc.over > 0 ? restWords : (spec.restLabel ?? strings.stackbarRest);
        const value = this.make('kp-stackbar__value');
        value.textContent = calc.over > 0 ? c.format(calc.sum) : c.format(calc.rest);
        item.append(swatch, label, value);
        return item;
    }

    /** The ticks across the bar at a share of the whole. @param {StackbarDraw} c */
    marks(c) {
        const { calc, bar } = c;
        for (const mark of c.spec.marks ?? []) {
            const tick = this.make('kp-stackbar__mark');
            tick.setAttribute('aria-hidden', 'true');
            tick.style.setProperty('--kp-at', String(calc.sum > calc.whole && calc.sum > 0 ? (mark.at * calc.whole) / calc.sum : mark.at));
            if (mark.label) tick.title = mark.label;
            bar.append(tick);
        }
    }

    /** The parts are one tab stop: the part that had the focus, else the first. @param {StackbarDraw} c */
    tabStop(c) {
        const segs = /** @type {HTMLElement[]} */ ([...c.bar.querySelectorAll('.kp-stackbar__seg')]);
        const stop = segs.find((seg) => seg.dataset.kpStackbarKey === c.focusedKey) ?? segs[0];
        stop?.setAttribute('tabindex', '0');
    }

    /** The segments, the legend, the rest, the ticks and the bar's name. @param {StackbarDraw} c */
    drawParts(c) {
        const { calc, bar, strings, spec, format, lang } = c;
        this.setParts(Math.max(2, calc.parts.length + (calc.rest > 0 || calc.over > 0 ? 1 : 0)));
        bar.setAttribute('role', 'group');
        /** @type {string[]} */
        const spoken = [];
        const legend = c.legendWanted ? this.make('kp-stackbar__legend', 'ul') : null;
        calc.parts.forEach((part, i) => {
            const said = strings.stackbarPart(part.label, format(part.value), shareText(part.share, lang));
            spoken.push(said);
            bar.append(this.segment(c, part, i, part.tip ?? said));
            legend?.append(this.legendRow(c, part, i));
        });
        if (calc.rest > 0 || calc.over > 0) {
            const restWords = calc.over > 0 ? strings.stackbarOver(format(calc.over)) : `${spec.restLabel ?? strings.stackbarRest}`;
            spoken.push(calc.over > 0 ? restWords : `${restWords}: ${format(calc.rest)}`);
            legend?.append(this.restRow(c, restWords));
        }
        bar.toggleAttribute('data-kp-over', calc.over > 0);
        bar.toggleAttribute('data-kp-stackbar-full', calc.rest === 0);
        bar.setAttribute(
            'aria-label',
            spec.label ?? (spec.title ? `${spec.title}. ${strings.stackbarLabel(spoken)}` : strings.stackbarLabel(spoken)),
        );
        this.marks(c);
        this.tabStop(c);
        if (legend) c.nodes.push(legend);
    }
}
