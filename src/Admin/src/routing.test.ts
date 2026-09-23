import { describe, expect, it } from 'vitest';
import { investigationPath, parseRoute } from './routing';

describe('application routes', () => {
  it('parses the role picker and role lists', () => {
    expect(parseRoute('/')).toEqual({ kind: 'role-picker' });
    expect(parseRoute('/admin/')).toEqual({ kind: 'investigation-list', role: 'admin' });
    expect(parseRoute('/user')).toEqual({ kind: 'investigation-list', role: 'user' });
  });

  it('parses direct investigation links', () => {
    expect(parseRoute('/user/investigations/abc-123')).toEqual({ kind: 'investigation', role: 'user', id: 'abc-123' });
    expect(parseRoute('/admin/investigations/a%2Fb')).toEqual({ kind: 'investigation', role: 'admin', id: 'a/b' });
  });

  it('builds encoded investigation links', () => {
    expect(investigationPath('user', 'a/b')).toBe('/user/investigations/a%2Fb');
  });
});
