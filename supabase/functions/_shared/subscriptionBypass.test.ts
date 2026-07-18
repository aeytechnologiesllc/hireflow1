import { userHasSubscriptionBypass } from "./subscriptionBypass.ts";

Deno.test("subscription bypass requires an admin-set boolean true value", () => {
  const allowed = userHasSubscriptionBypass({
    app_metadata: { subscription_bypass: true },
  });
  const stringValue = userHasSubscriptionBypass({
    app_metadata: { subscription_bypass: "true" },
  });
  const userMetadataOnly = userHasSubscriptionBypass({
    app_metadata: { user_metadata: { subscription_bypass: true } },
  });

  if (!allowed || stringValue || userMetadataOnly) {
    throw new Error("Subscription bypass metadata validation failed");
  }
});

Deno.test("subscription bypass defaults to disabled", () => {
  const cases = [undefined, null, {}, { app_metadata: null }];

  for (const value of cases) {
    if (userHasSubscriptionBypass(value)) {
      throw new Error("Missing subscription bypass metadata must fail closed");
    }
  }
});
