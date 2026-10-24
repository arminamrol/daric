import { logoMark } from '@daric/design-tokens';
import { cn } from './cn';

const { size, coin, rim, head, fletching } = logoMark;

/**
 * The coin-and-archer mark drawn faintly, as empty and error states' illustration: the logo's
 * shapes in quiet tones, so an empty screen still feels cared for without shouting. Decorative.
 */
export function CoinMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={cn('size-20 shrink-0', className)}
    >
      <circle {...coin} className="fill-primary-subtle" />
      <circle
        cx={rim.cx}
        cy={rim.cy}
        r={rim.r}
        fill="none"
        strokeWidth={rim.strokeWidth}
        className="stroke-primary/50"
      />
      <path
        d={logoMark.shaft}
        strokeWidth={logoMark.shaftWidth}
        strokeLinecap="round"
        className="stroke-primary"
      />
      <path
        d={head}
        strokeWidth={logoMark.headStrokeWidth}
        strokeLinejoin="round"
        className="fill-primary stroke-primary"
      />
      <g
        fill="none"
        strokeWidth={fletching.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary"
      >
        {fletching.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
