Buyer-only actions and server responses

This file documents which API endpoints are restricted to users with the `buyer` role and the standardized error response returned when a non-buyer (or an unauthenticated user) attempts the action.

1) Cart endpoints (buyer-only)
- POST /api/cart/add
- PUT /api/cart/update/:itemId
- DELETE /api/cart/remove/:itemId
- DELETE /api/cart/clear

2) Wishlist endpoints (buyer-only)
- POST /api/wishlist
- DELETE /api/wishlist/:productId

3) Notification subscription endpoints (buyer-only)
- POST /api/notifications/subscribe
- DELETE /api/notifications/unsubscribe/:productId
- GET /api/notifications/subscriptions/my-subscriptions

4) Reviews endpoints (create/update are buyer-only)
- POST /api/reviews
- PUT /api/reviews/:id
- (GET read endpoints remain public or token-optional)

Standardized 403 response
When a non-buyer attempts a buyer-only action, the server responds with HTTP 403 and a JSON payload in the following shape:

{
  "success": false,
  "message": "Only buyer accounts can ..."
}

Examples
- Trying to add to cart as a seller:
  HTTP/1.1 403 Forbidden
  Content-Type: application/json

  {
    "success": false,
    "message": "Only buyer accounts can modify the cart"
  }

Notes for front-end developers
- The front-end shows a toast with the server `message` when a 403 is returned. In several critical product UI places we've also added client-side role checks to prevent the action and show an explanatory toast immediately for a faster UX.
- Keep client-side checks for better UX, but always rely on server-side enforcement for security (defense in depth).

Testing locally
- Use a buyer token and a non-buyer (seller/admin) token to verify endpoint behavior.
- Example curl (replace TOKEN and HOST):
  curl -X POST "http://localhost:5000/api/cart/add" -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"productId":"<id>","quantity":1}'

If the token belongs to a non-buyer, expect HTTP 403 with `message`.
