import { describe, expect, it } from 'vitest';
import { deviceName } from './device-name';

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  firefoxIpad:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
};

describe('deviceName', () => {
  it.each([
    [UA.chromeWindows, 'Chrome · Windows'],
    [UA.safariMac, 'Safari · macOS'],
    [UA.firefoxLinux, 'Firefox · Linux'],
    [UA.edgeWindows, 'Edge · Windows'],
    [UA.safariIphone, 'Safari · iOS'],
    [UA.chromeIphone, 'Chrome · iOS'],
    [UA.chromeAndroid, 'Chrome · Android'],
    [UA.samsungAndroid, 'Samsung Internet · Android'],
    [UA.operaWindows, 'Opera · Windows'],
    [UA.chromeOs, 'Chrome · ChromeOS'],
    [UA.firefoxIpad, 'Firefox · iPadOS'],
  ])('names a browser by its user agent: %s', (userAgent, name) => {
    expect(deviceName({ userAgent })).toBe(name);
  });

  it('prefers the name a native app gives', () => {
    expect(deviceName({ given: '  iPhone 15 Pro ', userAgent: 'okhttp/4.12.0' })).toBe(
      'iPhone 15 Pro',
    );
  });

  it('ignores a given name that is blank or too long', () => {
    expect(deviceName({ given: '   ', userAgent: UA.chromeWindows })).toBe('Chrome · Windows');
    expect(deviceName({ given: 'x'.repeat(101), userAgent: null })).toBeNull();
  });

  it('names half of what it recognises', () => {
    expect(deviceName({ userAgent: 'SomeBot/1.0 (Windows NT 10.0)' })).toBe('Windows');
    expect(deviceName({ userAgent: 'Mozilla/5.0 Firefox/131.0' })).toBe('Firefox');
  });

  it('is null when nothing is recognised', () => {
    expect(deviceName({ userAgent: 'okhttp/4.12.0' })).toBeNull();
    expect(deviceName({ userAgent: null })).toBeNull();
  });
});
