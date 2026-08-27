import { strict as assert } from 'assert';
import {
  hashWebPassword,
  verifyWebPassword,
} from '../../src/apps/mandis/miniapp/services/webAuthPassword';

describe('webAuthPassword', () => {
  it('stores a one-way hash and verifies only the matching password', async () => {
    const password = 'a-secure-password';
    const passwordHash = await hashWebPassword(password);

    assert.notEqual(passwordHash, password);
    assert.equal(await verifyWebPassword(password, passwordHash), true);
    assert.equal(await verifyWebPassword('wrong-password', passwordHash), false);
  });
});
