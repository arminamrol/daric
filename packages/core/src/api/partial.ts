/** A partial update must change something. */
export const notEmpty = [
  (input: object) => Object.keys(input).length > 0,
  { message: 'Nothing to update' },
] as const;
