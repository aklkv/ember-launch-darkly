import type { TOC } from '@ember/component/template-only';

interface SquareSignature {
  Element: HTMLDivElement;
  Args: {
    color: string;
  };
}

function style(color: string): string {
  return `width: 200px; height: 200px; border: 2px solid black; background-color: ${color};`;
}

const Square: TOC<SquareSignature> = <template>
  <div style={{style @color}} ...attributes></div>
</template>;

export default Square;
