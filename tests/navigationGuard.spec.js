const path = require('path');
const {
  isInternalUrl,
  isAllowedExternalUrl,
  installNavigationGuard,
} = require('../src/main/navigationGuard');

const INDEX_HTML_PATH = path.resolve(__dirname, '../dist/renderer/index.html');
const INTERNAL_FILE_URL = `file://${INDEX_HTML_PATH}`;

const cases = [
  {
    url: 'http://localhost:3000/#/about',
    devInternal: true,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: `${INTERNAL_FILE_URL}#/about`,
    devInternal: false,
    packagedInternal: true,
    allowedExternal: false,
  },
  {
    url: 'http://localhost:3001/',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'file:///etc/passwd',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'https://github.com/SalimElheni1',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'https://www.github.com/SalimElheni1',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'https://www.linkedin.com/in/salimelheni1/',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'https://wa.me/21641578854',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'https://api.whatsapp.com/send?phone=21641578854',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'https://github.com.evil.com/phish',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'https://evilgithub.com/phish',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'http://github.com/SalimElheni1',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'javascript:alert(1)',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'data:text/html,<script>alert(1)</script>',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'https://user:pass@github.com/',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
  {
    url: 'mailto:elheni.selim@gmail.com',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: true,
  },
  {
    url: 'not-a-url',
    devInternal: false,
    packagedInternal: false,
    allowedExternal: false,
  },
];

describe('navigationGuard', () => {
  describe('isInternalUrl', () => {
    it.each(cases)('dev mode: $url → $devInternal', ({ url, devInternal }) => {
      expect(isInternalUrl(url, { isPackaged: false, isE2E: false })).toBe(devInternal);
    });

    it.each(cases)('packaged/e2e mode: $url → $packagedInternal', ({ url, packagedInternal }) => {
      expect(isInternalUrl(url, { isPackaged: true, isE2E: false })).toBe(packagedInternal);
      expect(isInternalUrl(url, { isPackaged: false, isE2E: true })).toBe(packagedInternal);
      expect(isInternalUrl(url, { isPackaged: true, isE2E: true })).toBe(packagedInternal);
    });
  });

  describe('isAllowedExternalUrl', () => {
    it.each(cases)('$url → $allowedExternal', ({ url, allowedExternal }) => {
      expect(isAllowedExternalUrl(url)).toBe(allowedExternal);
    });
  });

  describe('installNavigationGuard', () => {
    const makeWebContents = () => ({
      handlers: {},
      setWindowOpenHandler(handler) {
        this.handlers.windowOpen = handler;
      },
      on(event, handler) {
        this.handlers[event] = handler;
      },
    });

    const makeShell = () => ({ openExternal: jest.fn() });
    const makeEvent = () => ({ preventDefault: jest.fn() });

    it('always denies window.open and opens allowlisted URLs externally', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const result = webContents.handlers.windowOpen({ url: 'https://github.com/SalimElheni1' });
      expect(result).toEqual({ action: 'deny' });
      expect(shell.openExternal).toHaveBeenCalledWith('https://github.com/SalimElheni1');
    });

    it('denies window.open for non-allowlisted URLs without calling shell.openExternal', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const result = webContents.handlers.windowOpen({ url: 'https://evil.com' });
      expect(result).toEqual({ action: 'deny' });
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Blocked window.open:', 'https://evil.com');
    });

    it('allows will-navigate to internal URLs', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const event = makeEvent();
      webContents.handlers['will-navigate'](event, 'http://localhost:3000/#/about');
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('prevents will-navigate to external URLs and opens allowlisted ones externally', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const event = makeEvent();
      webContents.handlers['will-navigate'](event, 'https://wa.me/21641578854');
      expect(event.preventDefault).toHaveBeenCalled();
      expect(shell.openExternal).toHaveBeenCalledWith('https://wa.me/21641578854');
      expect(log).not.toHaveBeenCalled();
    });

    it('prevents will-navigate to non-allowlisted URLs and logs them', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const event = makeEvent();
      webContents.handlers['will-navigate'](event, 'https://evil.com');
      expect(event.preventDefault).toHaveBeenCalled();
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Blocked navigation:', 'https://evil.com');
    });

    it('allows will-redirect to internal URLs', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const event = makeEvent();
      webContents.handlers['will-redirect'](event, 'http://localhost:3000/#/about');
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(shell.openExternal).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('prevents will-redirect to external URLs and opens allowlisted ones externally', () => {
      const webContents = makeWebContents();
      const shell = makeShell();
      const log = jest.fn();

      installNavigationGuard(webContents, {
        shell,
        isPackaged: false,
        isE2E: false,
        log,
      });

      const event = makeEvent();
      webContents.handlers['will-redirect'](event, 'mailto:elheni.selim@gmail.com');
      expect(event.preventDefault).toHaveBeenCalled();
      expect(shell.openExternal).toHaveBeenCalledWith('mailto:elheni.selim@gmail.com');
    });
  });
});
