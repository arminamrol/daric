/**
 * Tailwind utilities that hard-code left or right. RTL layouts need their logical twins instead:
 * ms-/me-, ps-/pe-, start-/end-, text-start/end, border-s/e, rounded-s/e/ss/se/es/ee, float-start/end.
 */
const PHYSICAL =
  /^(?:m[lr]|p[lr]|scroll-[mp][lr]|left|right|border-[lr]|rounded-(?:[lr]|[tb][lr])|text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))(?:-|$)/;

/**
 * Strips variants (`md:hover:`, `[&>*]:`), the important mark and the negative sign from a class.
 * @param {string} name
 */
function utility(name) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '[') depth++;
    else if (name[i] === ']') depth--;
    else if (name[i] === ':' && depth === 0) start = i + 1;
  }
  return name.slice(start).replace(/^!|!$/g, '').replace(/^-/, '');
}

/** @type {import('eslint').Rule.RuleModule} */
export const logicalClasses = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow left/right Tailwind utilities in className; use start/end ones',
    },
    messages: {
      physical:
        '`{{name}}` is physical (left/right); use its logical start/end form so RTL mirrors.',
    },
    schema: [],
  },
  create(context) {
    const { visitorKeys } = context.sourceCode;

    /** @param {import('eslint').Rule.Node} node @param {string} text */
    function check(node, text) {
      for (const name of text.split(/\s+/)) {
        if (name && PHYSICAL.test(utility(name))) {
          context.report({ node, messageId: 'physical', data: { name } });
        }
      }
    }

    /** Checks every string inside a className value, including inside calls and conditionals. */
    function visit(/** @type {any} */ node) {
      if (node.type === 'Literal' && typeof node.value === 'string') check(node, node.value);
      if (node.type === 'TemplateElement') check(node, node.value.cooked ?? node.value.raw);
      for (const key of visitorKeys[node.type] ?? []) {
        for (const child of [node[key]].flat()) {
          if (child && typeof child.type === 'string') visit(child);
        }
      }
    }

    return {
      JSXAttribute(/** @type {any} */ node) {
        const { name, value } = node;
        if (value && name.type === 'JSXIdentifier' && /^(?:className|class)$/.test(name.name)) {
          visit(value);
        }
      },
    };
  },
};
