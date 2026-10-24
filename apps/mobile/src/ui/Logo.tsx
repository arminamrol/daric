import { logoColors, logoMark } from '@daric/design-tokens';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from './theme';

const { size: viewBox, coin, rim, head, halo, fletching } = logoMark;

/**
 * The Daric mark: a gold coin with the archer's arrow breaking its rim, in the theme's coin gold.
 * Decorative; the name beside it carries the meaning.
 */
export function Logo({ size }: { size: number }) {
  const colors = logoColors[useTheme().name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle {...coin} fill={colors.coin} />
      <Circle
        cx={rim.cx}
        cy={rim.cy}
        r={rim.r}
        fill="none"
        stroke={colors.ink}
        strokeWidth={rim.strokeWidth}
      />
      <Path
        d={head}
        fill={colors.coin}
        stroke={colors.coin}
        strokeWidth={halo * 2}
        strokeLinejoin="round"
      />
      <Path
        d={logoMark.shaft}
        stroke={colors.ink}
        strokeWidth={logoMark.shaftWidth}
        strokeLinecap="round"
      />
      <Path
        d={head}
        fill={colors.ink}
        stroke={colors.ink}
        strokeWidth={logoMark.headStrokeWidth}
        strokeLinejoin="round"
      />
      <G
        fill="none"
        stroke={colors.ink}
        strokeWidth={fletching.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {fletching.paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </G>
    </Svg>
  );
}
