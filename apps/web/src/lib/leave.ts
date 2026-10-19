/**
 * Sends the browser away to another site, such as a payment provider's page.
 * An object so tests can replace `to`; jsdom cannot navigate.
 */
export const leave = {
  to(url: string): void {
    window.location.assign(url);
  },
};
