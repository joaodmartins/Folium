import type { Locator, Page } from '@playwright/test';

/** A finger drag from (x, y) by (dx, dy), as touch events (the browser turns it into a scroll of whatever is under the finger). */
export async function drag(page: Page, x: number, y: number, dx: number, dy: number) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

export const scrollOf = (el: Locator) =>
  el.evaluate((node) => ({ top: node.scrollTop, left: node.scrollLeft, maxTop: node.scrollHeight - node.clientHeight, maxLeft: node.scrollWidth - node.clientWidth }));

export async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
