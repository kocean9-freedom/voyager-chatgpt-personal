import { describe, expect, it } from 'vitest';

import { scrollElementToAnchor } from './scrollMotion';

describe('scrollElementToAnchor', () => {
  it('scrolls upward with a negative offset in a column-reverse conversation', () => {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column-reverse';
    const turn = document.createElement('div');
    container.appendChild(turn);
    document.body.appendChild(container);
    Object.defineProperty(container, 'clientHeight', { value: 600 });
    container.getBoundingClientRect = () => ({
      top: 100,
      bottom: 700,
      left: 0,
      right: 100,
      width: 100,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    turn.getBoundingClientRect = () => ({
      top: -900,
      bottom: -800,
      left: 0,
      right: 100,
      width: 100,
      height: 100,
      x: 0,
      y: -900,
      toJSON: () => ({}),
    });

    scrollElementToAnchor(container, turn, 0, 600);

    expect(container.scrollTop).toBe(-1220);
    container.remove();
  });
});
