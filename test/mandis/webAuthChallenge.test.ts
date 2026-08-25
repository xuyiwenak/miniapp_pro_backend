import { strict as assert } from 'assert';
import { normalizeEmail } from '../../src/apps/mandis/miniapp/services/webAuthIdentity';

describe('webAuthChallenge', () => {
  it('normalizes email credentials before they become account identifiers', () => {
    assert.equal(normalizeEmail('  USER@Example.COM '), 'user@example.com');
  });
});
