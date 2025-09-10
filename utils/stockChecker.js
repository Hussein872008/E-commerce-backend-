const LOW_STOCK_THRESHOLD = 5;

async function checkProductStock(product, session) {
  if (product.quantity <= LOW_STOCK_THRESHOLD) {
      await createNotification({
        recipient: product.seller,
        type: 'product',
        message: `Product "${product.title}" is low in stock (only ${product.quantity} left)`,
        relatedId: product._id
      });
  }
}
