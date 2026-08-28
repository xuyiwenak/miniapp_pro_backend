import { strict as assert } from "assert";
import { EmailRegistrationSchema } from "../../src/apps/mandis/miniapp/services/webAuthRegistration";

const VALID_REGISTRATION = {
  email: "artist@example.com",
  emailCode: "123456",
  password: "a-secure-password",
};

describe("webAuthRegistration", () => {
  it("accepts email-first registration without a phone number", () => {
    assert.equal(
      EmailRegistrationSchema.safeParse(VALID_REGISTRATION).success,
      true
    );
  });

  it("requires a phone verification code whenever a phone number is provided", () => {
    const result = EmailRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      phone: "13800138000",
    });

    assert.equal(result.success, false);
  });

  it("accepts a verified optional phone number", () => {
    const result = EmailRegistrationSchema.safeParse({
      ...VALID_REGISTRATION,
      phone: "13800138000",
      phoneCode: "654321",
    });

    assert.equal(result.success, true);
  });
});
