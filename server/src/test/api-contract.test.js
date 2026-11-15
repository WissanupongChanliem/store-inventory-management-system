const pendingCases = {
  "Shared API requirements": [
    ["G1", "protected routes reject missing, invalid, and logged-out sessions"],
    ["G2", "product routes reject non-positive or malformed path IDs"],
    ["G3", "routes with JSON bodies reject malformed JSON"],
    ["G4", "errors expose only the documented error code, message, and safe details"],
    ["G5", "successful JSON responses put endpoint fields at the top level without data"],
  ],
  "Authentication API": [
    ["LOGIN-1", "valid credentials return the owner and a secure session cookie"],
    ["LOGIN-2", "the login session can access GET /api/auth/me"],
    ["LOGIN-3", "an incorrect password returns INVALID_CREDENTIALS"],
    ["LOGIN-4", "an unknown username returns the same INVALID_CREDENTIALS response"],
    ["LOGIN-5", "missing or wrongly typed credentials return field-specific validation errors"],
    ["LOGOUT-1", "logout clears the session cookie and returns 204"],
    ["LOGOUT-2", "the old cookie cannot access /api/auth/me after logout"],
    ["LOGOUT-3", "logout without a session safely returns 204"],
    ["ACCOUNT-1", "the owner can change only their username after confirming the current password"],
    ["ACCOUNT-2", "the owner can change only their password and use the new credentials to log in"],
    ["ACCOUNT-3", "the owner can change username and password together"],
    ["ACCOUNT-4", "an incorrect current password prevents account changes"],
    ["ACCOUNT-5", "missing current password or missing new credentials returns validation errors"],
    ["ACCOUNT-6", "invalid new username or password values return field-specific validation errors"],
    ["ACCOUNT-7", "unknown account-update fields are rejected"],
    ["ACCOUNT-8", "successful account changes invalidate existing sessions"],
  ],
  "Product creation": [
    ["PROD-C-1", "valid product creation returns a product and makes it listable"],
    ["PROD-C-2", "product names are trimmed before storage"],
    ["PROD-C-3", "duplicate names, ignoring case, return PRODUCT_NAME_EXISTS"],
    ["PROD-C-4", "missing required product fields return field-specific validation errors"],
    ["PROD-C-5", "invalid product names return VALIDATION_ERROR"],
    ["PROD-C-6", "invalid product amounts return VALIDATION_ERROR"],
    ["PROD-C-7", "invalid satang prices return VALIDATION_ERROR"],
    ["PROD-C-8", "zero stock and zero price are accepted"],
    ["PROD-C-9", "unknown product fields are rejected without creating a product"],
  ],
  "Product updates": [
    ["PROD-U-1", "updating only the name preserves other fields"],
    ["PROD-U-2", "updating amount sets the new absolute stock count"],
    ["PROD-U-3", "updating only the price returns and persists the new price"],
    ["PROD-U-4", "updating all product fields changes all requested values"],
    ["PROD-U-5", "an empty update body returns VALIDATION_ERROR"],
    ["PROD-U-6", "renaming to another product's name returns PRODUCT_NAME_EXISTS"],
    ["PROD-U-7", "renaming to the same name with different casing is allowed"],
    ["PROD-U-8", "invalid updated fields leave the product unchanged"],
    ["PROD-U-9", "unknown update fields are rejected"],
    ["PROD-U-10", "updating an unknown product returns PRODUCT_NOT_FOUND"],
    ["PROD-U-11", "updating a sold product does not change its historical sale snapshot"],
  ],
  "Product listing and search": [
    ["PROD-L-1", "the default product list is sorted and includes total, limit, and offset"],
    ["PROD-L-2", "name search is case-insensitive and matches contained text"],
    ["PROD-L-3", "numeric search matches both product names and IDs"],
    ["PROD-L-4", "a search with no matches returns an empty list and zero total"],
    ["PROD-L-5", "an empty search is equivalent to no search"],
    ["PROD-L-6", "percent and underscore search characters are treated literally"],
    ["PROD-L-7", "limit and offset return the requested page while total counts all matches"],
    ["PROD-L-8", "invalid limit and offset query values return BAD_REQUEST"],
  ],
  "Product deletion": [
    ["PROD-D-1", "deleting an existing product returns 204 and removes it from the list"],
    ["PROD-D-2", "deleting the same product a second time returns PRODUCT_NOT_FOUND"],
    ["PROD-D-3", "deleting an unknown product returns PRODUCT_NOT_FOUND"],
    ["PROD-D-4", "deleting a product preserves its historical sales"],
    ["PROD-D-5", "checkout of a deleted product returns PRODUCT_NOT_FOUND without changes"],
  ],
  "Checkout": [
    ["CO-1", "checkout calculates totals, snapshots items, decrements stock, and creates a sale"],
    ["CO-2", "client-supplied prices or totals are rejected without changing data"],
    ["CO-3", "checkout can reduce stock to exactly zero"],
    ["CO-4", "insufficient stock returns product-specific details without changing data"],
    ["CO-5", "a short line rolls back every stock deduction and sale in the request"],
    ["CO-6", "insufficient stock details include every short product"],
    ["CO-7", "checkout of an unknown product returns PRODUCT_NOT_FOUND"],
    ["CO-8", "an empty or missing item list returns VALIDATION_ERROR"],
    ["CO-9", "non-positive quantities and non-integer product IDs return validation errors"],
    ["CO-10", "duplicate product IDs in one checkout return VALIDATION_ERROR"],
    ["CO-11", "checkout uses the current database price, not the price seen when building the basket"],
    ["CO-12", "concurrent checkout for the last unit produces one success and one stock conflict"],
    ["CO-13", "a database failure rolls back stock changes and does not save a sale"],
  ],
  "Sales by day": [
    ["SALES-1", "daily sales are newest first and their summary matches the sales"],
    ["SALES-2", "a day without sales returns an empty list and zero totals"],
    ["SALES-3", "omitting date selects today in the configured store timezone"],
    ["SALES-4", "daily date boundaries honor the Asia/Bangkok timezone"],
    ["SALES-5", "invalid calendar dates and date formats return BAD_REQUEST"],
    ["SALES-6", "sale totals equal the sum of snapshotted line totals"],
    ["SALES-7", "sale snapshots retain original product names and prices after edits and deletion"],
  ],
};

describe("Simple app API specification (pending endpoint implementation)", () => {
  for (const [section, cases] of Object.entries(pendingCases)) {
    describe(section, () => {
      for (const [caseId, description] of cases) {
        test.todo(`${caseId}: ${description}`);
      }
    });
  }
});
