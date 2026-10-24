import { logoMark } from '@daric/design-tokens';

const { size, coin, rim, head, halo, fletching } = logoMark;

/**
 * The Daric mark: a gold coin with the archer's arrow breaking its rim, in the theme's coin gold.
 * Decorative; the name beside it carries the meaning.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={className}>
      <circle {...coin} className="fill-primary" />
      <circle
        cx={rim.cx}
        cy={rim.cy}
        r={rim.r}
        fill="none"
        strokeWidth={rim.strokeWidth}
        className="stroke-on-primary"
      />
      <path
        d={head}
        strokeWidth={halo * 2}
        strokeLinejoin="round"
        className="fill-primary stroke-primary"
      />
      <path
        d={logoMark.shaft}
        strokeWidth={logoMark.shaftWidth}
        strokeLinecap="round"
        className="stroke-on-primary"
      />
      <path
        d={head}
        strokeWidth={logoMark.headStrokeWidth}
        strokeLinejoin="round"
        className="fill-on-primary stroke-on-primary"
      />
      <g
        fill="none"
        strokeWidth={fletching.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-on-primary"
      >
        {fletching.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
