/**
 * Tailwind utilities that hard-code left or right but have logical twins RTL layouts need instead:
 * ms-/me-, ps-/pe-, start-/end-, text-start/end, border-s/e, rounded-s/e/ss/se/es/ee, float-start/end.
 */
const PHYSICAL =
  /^(?:m[lr]|p[lr]|scroll-[mp][lr]|left|right|border-[lr]|rounded-(?:[lr]|[tb][lr])|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))(?:-|$)/;

/**
 * Utilities pinned to left or right with no logical twin (transform origin, background and object
 * position, masks). They are allowed only as an explicit `ltr:`/`rtl:` mirror.
 */
const PINNED =
  /^(?:(?:perspective-origin|origin|bg|object)-(?:(?:top|bottom)-)?(?:left|right)(?:-(?:top|bottom))?$|mask-[lr]-)/;

/** An arbitrary property such as `[margin-left:1rem]`. */
const ARBITRARY = /^\[([a-z-]+):(.+)\]$/;

/**
 * Splits a class into its variants (`md`, `hover`, `[&>*]`) and its utility, without the important
 * mark or the negative sign.
 * @param {string} name
 */
function parseClass(name) {
  const variants = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '[') depth++;
    else if (name[i] === ']') depth--;
    else if (name[i] === ':' && depth === 0) {
      variants.push(name.slice(start, i));
      start = i + 1;
    }
  }
  const utility = name.slice(start).replace(/^!|!$/g, '').replace(/^-/, '');
  return { variants, utility };
}

/**
 * Why a Tailwind class breaks RTL mirroring, as a message id, or undefined when it is fine.
 * @param {string} name
 * @returns {'physical' | 'pinned' | undefined}
 */
function problem(name) {
  const { variants, utility } = parseClass(name);
  const arbitrary = ARBITRARY.exec(utility);
  if (arbitrary) {
    const [, property = '', value = ''] = arbitrary;
    const sided = /(?:^|-)(?:left|right)(?:-|$)/.test(property);
    const aligned = /^(?:text-align|float|clear)$/.test(property) && /^(?:left|right)$/.test(value);
    return sided || aligned ? 'physical' : undefined;
  }
  if (PHYSICAL.test(utility)) return 'physical';
  if (PINNED.test(utility) && !variants.some((v) => v === 'ltr' || v === 'rtl')) return 'pinned';
  return undefined;
}

const messages = {
  physical: '`{{name}}` is physical (left/right); use its logical start/end form so RTL mirrors.',
  pinned: '`{{name}}` is pinned to left/right; mirror it with an `ltr:` and `rtl:` pair.',
};

/**
 * Reports each class in a whitespace-separated list that breaks RTL mirroring.
 * @param {import('eslint').Rule.RuleContext} context
 * @param {any} node
 * @param {string} text
 */
function checkClasses(context, node, text) {
  for (const name of text.split(/\s+/)) {
    const messageId = name && problem(name);
    if (messageId) context.report({ node, messageId, data: { name } });
  }
}

/** Functions that build class lists (shadcn/ui keeps its classes in these, outside className). */
const CLASS_HELPERS = new Set(['cn', 'cva', 'clsx', 'twMerge']);

/** @param {any} node */
function isClassHelperCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    CLASS_HELPERS.has(node.callee.name)
  );
}

/** @type {import('eslint').Rule.RuleModule} */
export const logicalClasses = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow left/right Tailwind utilities in className and class helpers; use start/end ones',
    },
    messages,
    schema: [],
  },
  create(context) {
    const { visitorKeys } = context.sourceCode;

    /**
     * Checks every string inside a className value or a class helper's arguments, including inside
     * calls, conditionals and variant maps. Class strings kept in plain variables are not seen.
     */
    function visit(/** @type {any} */ node, root = false) {
      // A class helper is checked once, by its own listener.
      if (!root && isClassHelperCall(node)) return;
      if (node.type === 'Literal' && typeof node.value === 'string') {
        checkClasses(context, node, node.value);
      }
      if (node.type === 'TemplateElement') {
        checkClasses(context, node, node.value.cooked ?? node.value.raw);
      }
      for (const key of visitorKeys[node.type] ?? []) {
        for (const child of [node[key]].flat()) {
          if (child && typeof child.type === 'string') visit(child);
        }
      }
    }

    return {
      CallExpression(/** @type {any} */ node) {
        if (isClassHelperCall(node)) visit(node, true);
      },
      JSXAttribute(/** @type {any} */ node) {
        const { name, value } = node;
        if (value && name.type === 'JSXIdentifier' && /^(?:className|class)$/.test(name.name)) {
          visit(value);
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
export const logicalApply = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow left/right Tailwind utilities in CSS @apply' },
    messages,
    schema: [],
  },
  create(context) {
    return {
      Atrule(/** @type {any} */ node) {
        if (node.name === 'apply' && node.prelude) {
          checkClasses(context, node, context.sourceCode.getText(node.prelude));
        }
      },
    };
  },
};
